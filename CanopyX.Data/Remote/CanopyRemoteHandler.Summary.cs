using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    private const double SafeInteger = 9007199254740991d;

    /// <summary>Answers a validated summary request with a <c>gridSummary</c> document.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The summary document. Groups are ordered by the protocol's group order and given contiguous ranges.</returns>
    public async Task<string> SummaryAsync(CanopySummaryRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        if (!Schema.HasSummary) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This view declares no grouping or aggregates.");
        var revision = await RevisionAsync(request.Query.Revision, cancellationToken).ConfigureAwait(false);
        var result = await Provider.SummarizeAsync(request, cancellationToken).ConfigureAwait(false);
        var groups = OrderGroups(request, result);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject();
            writer.WriteString("protocol", "canopyx/2");
            writer.WriteString("type", "gridSummary");
            writer.WriteString("view", Schema.ViewId);
            writer.WriteString("revision", revision);
            writer.WriteNumber("matched", result.Matched);
            writer.WritePropertyName("query");
            WriteQueryEcho(writer, request.Query, revision);
            WriteAggregates(writer, request, result.Aggregates, result.Matched);
            writer.WriteStartArray("groups");
            var offset = 0;
            foreach (var group in groups) {
                writer.WriteStartObject();
                writer.WriteString("key", GroupKey(group.Value));
                writer.WritePropertyName("value");
                WriteValue(writer, group.Value);
                writer.WriteNumber("offset", offset);
                writer.WriteNumber("count", group.Count);
                WriteAggregates(writer, request, group.Aggregates, group.Count);
                writer.WriteEndObject();
                offset += group.Count;
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        var json = Encoding.UTF8.GetString(stream.ToArray());
        if (json.Length > 4194304) throw CanopyRequestException.Limit("The summary is larger than the protocol allows.");
        return json;
    }

    private List<CanopySummaryGroup> OrderGroups(CanopySummaryRequest request, CanopySummaryResult result) {
        var groups = new List<CanopySummaryGroup>(result.Groups);
        if (request.GroupColumn == null) {
            if (groups.Count != 0) throw new InvalidOperationException("An ungrouped summary cannot return groups.");
            return groups;
        }
        if (groups.Count > Options.Limits.MaxGroups) throw CanopyRequestException.Limit("The result has more groups than this endpoint allows.");
        var compare = Schema.Grouping!.CreateComparer(Schema.View);
        groups.Sort((left, right) => compare.Compare(CanopyDataValues.ToCell(left.Value)!, CanopyDataValues.ToCell(right.Value)!));
        var keys = new HashSet<string>(StringComparer.Ordinal);
        long sum = 0;
        CanopySummaryGroup? previous = null;
        foreach (var group in groups) {
            // The browser accepts strictly ordered groups only. Values the store keeps apart but the protocol treats as one
            // (instants that differ below a millisecond, for example) cannot be served as groups.
            if (!keys.Add(GroupKey(group.Value)) || previous != null && compare.Compare(CanopyDataValues.ToCell(previous.Value)!, CanopyDataValues.ToCell(group.Value)!) >= 0)
                throw new InvalidOperationException("The data provider returned groups that the protocol cannot tell apart; store grouping values at protocol precision.");
            previous = group;
            sum += group.Count;
        }
        if (sum != result.Matched) throw new InvalidOperationException("The data provider's groups do not account for every matching record.");
        return groups;
    }

    private static void WriteQueryEcho(Utf8JsonWriter writer, CanopyDataRequest query, string revision) {
        if (query.RawQuery != null) {
            using var raw = JsonDocument.Parse(query.RawQuery);
            raw.RootElement.WriteTo(writer);
            return;
        }
        // A request built in code has no wire form; echo its normalized equivalent.
        writer.WriteStartObject();
        writer.WriteString("protocol", "canopyx/2");
        writer.WriteString("type", "gridQuery");
        writer.WriteString("view", query.Schema.ViewId);
        writer.WriteString("revision", revision);
        writer.WriteNumber("offset", 0);
        writer.WriteNumber("limit", query.Schema.View.PageSize);
        writer.WriteString("search", query.Search);
        if (query.SearchMode == CanopyGridSearchMode.Words) writer.WriteString("searchMode", "words");
        writer.WriteStartArray("sort");
        foreach (var key in query.Sort) {
            writer.WriteStartObject();
            writer.WriteString("column", key.Column.Id);
            writer.WriteString("direction", key.Descending ? "desc" : "asc");
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("filters");
        writer.WriteEndArray();
        if (query.Filter != null) {
            writer.WritePropertyName("filterGroup");
            WriteFilter(writer, query.Filter is CanopyFilterGroup ? query.Filter : new CanopyFilterGroup(CanopyGridFilterJunction.All, new[] { query.Filter }));
        }
        writer.WriteEndObject();
    }

    private static void WriteFilter(Utf8JsonWriter writer, CanopyFilterNode node) {
        if (node is CanopyFilterGroup group) {
            writer.WriteStartObject();
            writer.WriteString("operator", group.Junction == CanopyGridFilterJunction.All ? "and" : "or");
            writer.WriteStartArray("filters");
            foreach (var child in group.Children) if (child is CanopyFilterCondition) WriteFilter(writer, child);
            writer.WriteEndArray();
            writer.WriteStartArray("groups");
            foreach (var child in group.Children) if (child is CanopyFilterGroup) WriteFilter(writer, child);
            writer.WriteEndArray();
            writer.WriteEndObject();
            return;
        }
        if (node is not CanopyFilterCondition condition) throw new InvalidOperationException("Constant filters have no wire form.");
        writer.WriteStartObject();
        writer.WriteString("column", condition.Column.Id);
        writer.WriteString("operator", condition.Operator switch {
            CanopyGridFilterOperator.Equal => "eq", CanopyGridFilterOperator.NotEqual => "ne", CanopyGridFilterOperator.Contains => "contains",
            CanopyGridFilterOperator.StartsWith => "startsWith", CanopyGridFilterOperator.In => "in", CanopyGridFilterOperator.GreaterThan => "gt",
            CanopyGridFilterOperator.GreaterThanOrEqual => "ge", CanopyGridFilterOperator.LessThan => "lt", CanopyGridFilterOperator.LessThanOrEqual => "le",
            CanopyGridFilterOperator.IsNull => "isNull", _ => "isNotNull"
        });
        writer.WriteStartArray("values");
        foreach (var value in condition.Values) WriteValue(writer, value);
        writer.WriteEndArray();
        writer.WriteEndObject();
    }

    private static void WriteAggregates(Utf8JsonWriter writer, CanopySummaryRequest request, IReadOnlyDictionary<string, double?> values, int count) {
        writer.WriteStartObject("aggregates");
        foreach (var aggregate in request.Aggregates) {
            if (!values.TryGetValue(aggregate.Id, out var value)) throw new InvalidOperationException("The data provider omitted aggregate '" + aggregate.Id + "'.");
            if (value.HasValue && (double.IsNaN(value.Value) || double.IsInfinity(value.Value) || Math.Abs(value.Value) > SafeInteger))
                throw new InvalidOperationException("Aggregate '" + aggregate.Id + "' is not a finite number within the safe integer magnitude.");
            if (aggregate.Operation == CanopyGridAggregateOperation.Count) {
                if (!value.HasValue || value < 0 || value > count || value != Math.Floor(value.Value))
                    throw new InvalidOperationException("Count aggregate '" + aggregate.Id + "' must be an integer within its record count.");
            } else if (count == 0) {
                value = null;
            }
            writer.WritePropertyName(aggregate.Id);
            if (value.HasValue) writer.WriteNumberValue(value.Value); else writer.WriteNullValue();
        }
        writer.WriteEndObject();
    }

    private static void WriteValue(Utf8JsonWriter writer, object? value) {
        switch (CanopyDataValues.Normalize(value)) {
            case null: writer.WriteNullValue(); break;
            case string text: writer.WriteStringValue(text); break;
            case bool flag: writer.WriteBooleanValue(flag); break;
            case long number: writer.WriteNumberValue(number); break;
            case decimal number: writer.WriteNumberValue(number); break;
            case double number: writer.WriteNumberValue(number); break;
            case DateTime date: writer.WriteStringValue(CanopyDataValues.FormatDate(date)); break;
        }
    }

    /// <summary>A stable group identity derived from the exact raw value; long or malformed text is hashed.</summary>
    internal static string GroupKey(object? value) {
        switch (CanopyDataValues.Normalize(value)) {
            case null: return "null";
            case bool flag: return flag ? "b:true" : "b:false";
            case DateTime date: return "d:" + (date.Ticks / TimeSpan.TicksPerMillisecond).ToString(CultureInfo.InvariantCulture);
            case string text:
                return text.Length <= 4000 && WellFormed(text) ? "s:" + text : "h:" + Hash(text);
            case var number:
                var real = CanopyDataValues.ToDouble(number!);
                return "n:" + (real == 0 ? "0" : real.ToString("R", CultureInfo.InvariantCulture));
        }
    }

    private static bool WellFormed(string text) {
        for (var i = 0; i < text.Length; i++) {
            if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { i++; continue; }
            if (char.IsSurrogate(text[i])) return false;
        }
        return true;
    }

    private static string Hash(string text) {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.Unicode.GetBytes(text));
        var builder = new StringBuilder(bytes.Length * 2);
        foreach (var b in bytes) builder.Append(b.ToString("x2", CultureInfo.InvariantCulture));
        return builder.ToString();
    }
}
