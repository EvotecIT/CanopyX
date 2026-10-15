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
    /// <returns>The summary document. Groups are ordered by each level's order, nested level by level and given contiguous
    /// absolute ranges; their keys are unique across levels.</returns>
    public async Task<string> SummaryAsync(CanopySummaryRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        if (!Schema.HasSummary) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This view declares no grouping or aggregates.");
        var revision = await RevisionAsync(request.Query.Revision, cancellationToken).ConfigureAwait(false);
        var result = await Provider.SummarizeAsync(request, cancellationToken).ConfigureAwait(false);
        if (request.Levels.Count == 0 && result.Groups.Count != 0) throw new InvalidOperationException("An ungrouped summary cannot return groups.");
        var counter = new int[1];
        var groups = request.Levels.Count == 0 ? new List<OrderedGroup>() : OrderLevel(request, result.Groups, 0, result.Matched, new List<string>(), counter);
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
            writer.WritePropertyName("groups");
            WriteGroups(writer, request, groups, 0);
            writer.WriteEndObject();
        }
        var json = Encoding.UTF8.GetString(stream.ToArray());
        if (json.Length > 4194304) throw CanopyRequestException.Limit("The summary is larger than the protocol allows.");
        return json;
    }

    /// <summary>A provider group in its level's order, with its key and its ordered inner groups.</summary>
    private sealed class OrderedGroup {
        internal OrderedGroup(CanopySummaryGroup group, string key) { Group = group; Key = key; }
        internal CanopySummaryGroup Group { get; }
        internal string Key { get; }
        internal List<OrderedGroup> Groups { get; } = new List<OrderedGroup>();
    }

    /// <summary>Orders one level's sibling groups and checks them: distinct values, strict level order, counts that cover the parent.</summary>
    private List<OrderedGroup> OrderLevel(CanopySummaryRequest request, IReadOnlyList<CanopySummaryGroup> source, int depth, int expected, List<string> path, int[] counter) {
        var level = request.Levels[depth];
        counter[0] += source.Count;
        if (counter[0] > Options.Limits.MaxGroups) throw CanopyRequestException.Limit("The result has more groups than this endpoint allows.");
        var compare = GroupOrdering.Create<CanopySummaryGroup>(Schema, level, group => group.Value, group => AggregateOf(group, level));
        var groups = new List<CanopySummaryGroup>(source);
        groups.Sort(compare);
        var ordered = new List<OrderedGroup>(groups.Count);
        var values = new HashSet<string>(StringComparer.Ordinal);
        long sum = 0;
        CanopySummaryGroup? previous = null;
        foreach (var group in groups) {
            // The browser accepts strictly ordered groups only. Values the store keeps apart but the protocol treats as one
            // (instants that differ below a millisecond, for example) cannot be served as groups.
            var own = GroupKey(group.Value);
            if (!values.Add(own) || previous != null && compare(previous, group) >= 0)
                throw new InvalidOperationException("The data provider returned groups that the protocol cannot tell apart; store grouping values at protocol precision.");
            previous = group;
            sum += group.Count;
            path.Add(own);
            var item = new OrderedGroup(group, GroupOrdering.Key(path));
            if (depth + 1 < request.Levels.Count) {
                if (group.Groups.Count == 0) throw Changed();
                item.Groups.AddRange(OrderLevel(request, group.Groups, depth + 1, group.Count, path, counter));
            } else if (group.Groups.Count != 0) {
                throw new InvalidOperationException("Groups of the innermost level cannot have inner groups.");
            }
            path.RemoveAt(path.Count - 1);
            ordered.Add(item);
        }
        if (sum != expected) throw Changed();
        return ordered;
    }

    // Levels are read by separate scans; records written in between leave groups that do not add up. The client reloads.
    private static CanopyRequestException Changed() => new CanopyRequestException(CanopyRequestError.StaleRevision, "The data changed while the summary was read; reload the grid.");

    private static double? AggregateOf(CanopySummaryGroup group, CanopySummaryLevel level) {
        if (level.Aggregate == null) return null;
        if (!group.Aggregates.TryGetValue(level.Aggregate.Id, out var value)) throw new InvalidOperationException("The data provider omitted aggregate '" + level.Aggregate.Id + "'.");
        return value;
    }

    private static void WriteGroups(Utf8JsonWriter writer, CanopySummaryRequest request, List<OrderedGroup> groups, int offset) {
        writer.WriteStartArray();
        foreach (var item in groups) {
            var group = item.Group;
            writer.WriteStartObject();
            writer.WriteString("key", item.Key);
            writer.WritePropertyName("value");
            WriteValue(writer, group.Value);
            writer.WriteNumber("offset", offset);
            writer.WriteNumber("count", group.Count);
            WriteAggregates(writer, request, group.Aggregates, group.Count);
            if (item.Groups.Count != 0) {
                writer.WritePropertyName("groups");
                WriteGroups(writer, request, item.Groups, offset);
            }
            writer.WriteEndObject();
            offset += group.Count;
        }
        writer.WriteEndArray();
    }

    private static void WriteQueryEcho(Utf8JsonWriter writer, CanopyDataRequest query, string revision) {
        using var raw = query.RawQuery == null ? null : JsonDocument.Parse(query.RawQuery);
        // Parsing accepts shorthand and additive input fields. A summary always owns a complete protocol query,
        // with the effective grouping/sort and a zero offset because its ranges cover the complete result.
        writer.WriteStartObject();
        writer.WriteString("protocol", "canopyx/2");
        writer.WriteString("type", "gridQuery");
        writer.WriteString("view", query.Schema.ViewId);
        writer.WriteString("revision", revision);
        writer.WriteNumber("offset", 0);
        writer.WriteNumber("limit", query.Limit);
        writer.WriteString("search", query.Search);
        if (query.SearchMode == CanopyGridSearchMode.Words || raw != null && raw.RootElement.TryGetProperty("searchMode", out var mode) && mode.ValueKind == JsonValueKind.String)
            writer.WriteString("searchMode", query.SearchMode == CanopyGridSearchMode.Words ? "words" : "substring");
        writer.WriteStartArray("sort");
        foreach (var level in query.Levels) {
            writer.WriteStartObject();
            writer.WriteString("column", level.Column.Id);
            writer.WriteString("direction", level.Aggregate == null && level.Descending ? "desc" : "asc");
            writer.WriteEndObject();
        }
        foreach (var key in query.InnerSort) {
            writer.WriteStartObject();
            writer.WriteString("column", key.Column.Id);
            writer.WriteString("direction", key.Descending ? "desc" : "asc");
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WriteStartArray("filters");
        if (raw != null && raw.RootElement.TryGetProperty("filters", out var filters) && filters.ValueKind == JsonValueKind.Array)
            foreach (var filter in filters.EnumerateArray()) WriteWireFilter(writer, filter);
        writer.WriteEndArray();
        if (raw != null) {
            // Preserve accepted predicate shape and operand text: the browser compares the normalized query's
            // ownership, and equivalent date spellings or moving a flat predicate into a group changes that shape.
            if (raw.RootElement.TryGetProperty("filterGroup", out var group) && group.ValueKind == JsonValueKind.Object) {
                writer.WritePropertyName("filterGroup");
                WriteWireFilterGroup(writer, group);
            }
        } else if (query.Filter != null) {
            writer.WritePropertyName("filterGroup");
            WriteFilter(writer, query.Filter is CanopyFilterGroup ? query.Filter : new CanopyFilterGroup(CanopyGridFilterJunction.All, new[] { query.Filter }));
        }
        if (query.Schema.DynamicGrouping) {
            writer.WriteStartArray("groupBy");
            foreach (var level in query.Levels) {
                writer.WriteStartObject();
                writer.WriteString("column", level.Column.Id);
                writer.WriteString("direction", level.Descending ? "desc" : "asc");
                if (level.Aggregate != null) writer.WriteString("aggregate", level.Aggregate.Id);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }
        writer.WriteEndObject();
    }

    /// <summary>Writes only accepted predicate fields, retaining the original operands.</summary>
    private static void WriteWireFilter(Utf8JsonWriter writer, JsonElement filter) {
        writer.WriteStartObject();
        foreach (var name in new[] { "column", "operator", "values" }) {
            writer.WritePropertyName(name);
            filter.GetProperty(name).WriteTo(writer);
        }
        writer.WriteEndObject();
    }

    /// <summary>Fills optional group arrays and leaves ignored additive input fields out of the owned query.</summary>
    private static void WriteWireFilterGroup(Utf8JsonWriter writer, JsonElement group) {
        writer.WriteStartObject();
        writer.WriteString("operator", group.GetProperty("operator").GetString());
        writer.WriteStartArray("filters");
        if (group.TryGetProperty("filters", out var filters) && filters.ValueKind == JsonValueKind.Array)
            foreach (var filter in filters.EnumerateArray()) WriteWireFilter(writer, filter);
        writer.WriteEndArray();
        writer.WriteStartArray("groups");
        if (group.TryGetProperty("groups", out var groups) && groups.ValueKind == JsonValueKind.Array)
            foreach (var child in groups.EnumerateArray()) WriteWireFilterGroup(writer, child);
        writer.WriteEndArray();
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
            if (aggregate.Counting) {
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
