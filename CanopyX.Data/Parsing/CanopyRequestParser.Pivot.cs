using System;
using System.Linq;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    /// <summary>Parses a bounded <c>gridPivotQuery</c> containing its accepted query and pivot definition.</summary>
    /// <param name="json">The data-only request document.</param>
    /// <param name="schema">The endpoint's allow-list and reporting opt-in.</param>
    /// <param name="limits">Request limits, or null for defaults.</param>
    /// <returns>A validated complete-query pivot request.</returns>
    public static CanopyPivotRequest ParsePivot(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "pivot request"); Envelope(root, "gridPivotQuery");
        if (!root.TryGetProperty("query", out var queryElement)) throw CanopyRequestException.Document("A pivot needs its accepted query.");
        var query = Query(queryElement, schema, limits, true);
        if (query.Revision == null) throw CanopyRequestException.Document("A pivot needs its accepted revision.");
        if (!root.TryGetProperty("definition", out var definition)) throw CanopyRequestException.Document("A pivot needs its axes and values.");
        try { return new CanopyPivotRequest(query, PivotDefinition(definition, schema)); }
        catch (InvalidOperationException) { throw CanopyRequestException.Document("The pivot axes, values or bounds are invalid."); }
        catch (ArgumentException) { throw CanopyRequestException.Document("The pivot axes, values or bounds are invalid."); }
    }
    private static CanopyGridPivot PivotDefinition(JsonElement element, CanopyDataSchema schema) {
        var definition = RequireObject(element, "pivot definition");
        CheckPivotFields(definition, "rows", "columns", "values", "maxColumns", "topNColumns", "sortByTotal");
        var result = new CanopyGridPivot { MaxColumns = OptionalInteger(definition, "maxColumns") ?? 200, TopNColumns = OptionalInteger(definition, "topNColumns") };
        void Levels(string name, int max, System.Collections.Generic.IList<CanopyGridGroupLevel> target) {
            if (!definition.TryGetProperty(name, out var levels) || levels.ValueKind != JsonValueKind.Array || levels.GetArrayLength() > max) throw CanopyRequestException.Document("Invalid pivot axis.");
            foreach (var level in levels.EnumerateArray()) {
                CheckPivotFields(RequireObject(level, "pivot level"), "column", "direction", "bucket");
                var column = schema.GetColumn(RequireString(level, "column"));
                var direction = RequireString(level, "direction");
                if (direction != "asc" && direction != "desc") throw CanopyRequestException.Document("A pivot direction is asc or desc.");
                target.Add(new CanopyGridGroupLevel(column.Id, direction == "desc", bucket: CanopyBucketParser.Read(level, column.Definition)));
            }
        }
        Levels("rows", 4, result.Rows); Levels("columns", 2, result.Columns);
        if (!definition.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array || values.GetArrayLength() < 1 || values.GetArrayLength() > 32)
            throw CanopyRequestException.Document("A pivot needs one to 32 aggregate values.");
        foreach (var value in values.EnumerateArray()) result.Values.Add(value.ValueKind == JsonValueKind.String ? value.GetString()! : throw CanopyRequestException.Document("A pivot value is an aggregate identity."));
        if (definition.TryGetProperty("sortByTotal", out var sort)) {
            CheckPivotFields(RequireObject(sort, "pivot total sort"), "aggregate", "direction");
            result.SortByTotal = RequireString(sort, "aggregate");
            var direction = RequireString(sort, "direction");
            if (direction != "asc" && direction != "desc") throw CanopyRequestException.Document("A total sort direction is asc or desc.");
            result.SortDescending = direction == "desc";
        }
        return result;
    }
    private static void CheckPivotFields(JsonElement element, params string[] allowed) {
        var seen = new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
        foreach (var field in element.EnumerateObject()) if (!allowed.Contains(field.Name) || !seen.Add(field.Name)) throw CanopyRequestException.Document("Unknown or duplicate pivot field.");
    }
}
