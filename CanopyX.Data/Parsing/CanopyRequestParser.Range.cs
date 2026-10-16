using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    private static readonly Regex UtcInstant = new Regex(@"^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,7})?)?Z$", RegexOptions.CultureInvariant);
    private static readonly string[] CalendarViews = { "month", "week", "day", "days", "agenda", "year", "timeline", "mini", "weekList", "dayList", "months" };

    /// <summary>Parses a <c>gridRangeQuery</c> document: the records of a complete query that overlap a UTC window.</summary>
    /// <param name="json">The document.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults. A requested limit above
    /// <see cref="CanopyRemoteLimits.MaxRangeRows"/> is lowered to it.</param>
    /// <returns>The validated range request.</returns>
    /// <exception cref="CanopyRequestException">The document is malformed or targets another view; <c>from</c> and <c>to</c> are
    /// not ISO 8601 UTC instants, are reversed or lie more than 3,700 days apart; a range column is not on the allow-list
    /// (<see cref="CanopyRequestError.UnknownColumn"/>), not filterable (<see cref="CanopyRequestError.ColumnNotFilterable"/>) or of
    /// the wrong kind; the resources are invalid or have no resource column; or a limit is exceeded.</exception>
    public static CanopyRangeRequest ParseRange(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "range request");
        Envelope(root, "gridRangeQuery");
        var view = OptionalString(root, "view");
        if (view != null && view != schema.ViewId) throw CanopyRequestException.Document("The request targets another view.");
        var from = RangeInstant(root, "from");
        var to = RangeInstant(root, "to");
        if (from >= to) throw CanopyRequestException.Document("The range must end after it starts.");
        if (to - from > TimeSpan.FromDays(3700)) throw CanopyRequestException.Limit("The range spans more than 3,700 days.");
        var start = RangeColumn(root, "start", CanopyColumnKind.DateTime, schema, true)!;
        var end = RangeColumn(root, "end", CanopyColumnKind.DateTime, schema, false);
        var recurrence = RangeColumn(root, "recurrence", CanopyColumnKind.Text, schema, false);
        var seriesEnd = RangeColumn(root, "seriesEnd", CanopyColumnKind.DateTime, schema, false);
        var resource = RangeColumn(root, "resource", CanopyColumnKind.Text, schema, false);
        var resources = RangeResources(root, resource != null, limits);
        var calendarView = OptionalString(root, "calendarView");
        if (calendarView != null && Array.IndexOf(CalendarViews, calendarView) < 0)
            throw CanopyRequestException.Document("The calendar view is month, week, day, days, agenda, year, timeline, mini, weekList, dayList or months.");
        var limit = OptionalInteger(root, "limit") ?? limits.MaxRangeRows;
        if (limit < 1 || limit > 10000) throw CanopyRequestException.Document("A range returns 1 to 10,000 records.");
        if (!root.TryGetProperty("query", out var queryElement) || queryElement.ValueKind == JsonValueKind.Null)
            throw CanopyRequestException.Document("A range needs its accepted query.");
        var query = Query(queryElement, schema, limits, true);
        return new CanopyRangeRequest(query, from, to, start, end, recurrence, seriesEnd, resource, resources, Math.Min(limit, limits.MaxRangeRows), calendarView);
    }

    /// <summary>Validates a typed range request built in C#, applying the same allow-list and limits as wire requests.</summary>
    /// <param name="query">The typed range request.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated range request.</returns>
    /// <remarks>The request is written to its wire form with <see cref="CanopyGridRangeQuery.ToJson(CanopyDataGridView)"/> and parsed back.</remarks>
    public static CanopyRangeRequest FromRangeQuery(CanopyGridRangeQuery query, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        return ParseRange(query.ToJson(schema.ProtocolView), schema, limits);
    }

    private static DateTime RangeInstant(JsonElement root, string name) {
        var text = RequireString(root, name);
        if (text.Length > 64 || !UtcInstant.IsMatch(text) ||
            !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var instant))
            throw CanopyRequestException.Document("The range '" + name + "' must be an ISO 8601 UTC instant ending in Z.");
        if (instant.UtcDateTime < MinimumInstant || instant.UtcDateTime > MaximumInstant)
            throw CanopyRequestException.Document("The range '" + name + "' must fall between the years 0002 and 9998.");
        return CanopyDataValues.TruncateToMilliseconds(instant.UtcDateTime);
    }

    private static CanopyDataColumn? RangeColumn(JsonElement root, string name, CanopyColumnKind kind, CanopyDataSchema schema, bool required) {
        var id = required ? RequireString(root, name) : OptionalString(root, name);
        if (id == null) return null;
        var column = schema.GetColumn(id);
        if (!column.Filterable) throw new CanopyRequestException(CanopyRequestError.ColumnNotFilterable, "The range '" + name + "' column cannot be filtered.");
        if (column.Kind != kind) throw CanopyRequestException.Document("The range '" + name + "' column must be a " + (kind == CanopyColumnKind.DateTime ? "date" : "text") + " column.");
        return column;
    }

    private static List<string>? RangeResources(JsonElement root, bool hasColumn, CanopyRemoteLimits limits) {
        if (!root.TryGetProperty("resources", out var element) || element.ValueKind == JsonValueKind.Null) return null;
        if (element.ValueKind != JsonValueKind.Array) throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The field 'resources' must be an array.");
        if (!hasColumn) throw CanopyRequestException.Document("A resource restriction needs the resource column.");
        var count = element.GetArrayLength();
        if (count == 0) throw CanopyRequestException.Document("A resource restriction lists 1 to 1,000 identities.");
        if (count > 1000 || count > limits.MaxInValues) throw CanopyRequestException.Limit("The resource restriction lists too many identities.");
        var list = new List<string>(count);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in element.EnumerateArray()) {
            if (item.ValueKind != JsonValueKind.String) throw new CanopyRequestException(CanopyRequestError.InvalidJson, "Resource identities must be text.");
            string text;
            try {
                text = item.GetString()!;
            } catch (InvalidOperationException) {
                throw new CanopyRequestException(CanopyRequestError.InvalidJson, "Resource identities must be well-formed text.");
            }
            if (text.Length > Math.Min(4096, limits.MaxOperandLength)) throw CanopyRequestException.Limit("A resource identity is too long.");
            RequireIdentifier(text, "resource identity");
            if (!seen.Add(text)) throw CanopyRequestException.Document("Resource identities must be unique.");
            list.Add(text);
        }
        return list;
    }
}
