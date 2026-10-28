using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Maps data-only analysis proposals into the canonical pivot, grouping and bucket validators.</summary>
internal static class CanopyViewIntentAnalysis {
    internal static CanopyGridGroupLevel Level(object? node, IDictionary<string, CanopyColumn> columns, bool pivot) {
        var map = pivot
            ? CanopyFlowContract.Object(node, "Intent pivot level", "column", "direction", "bucket")
            : CanopyFlowContract.Object(node, "Intent group level", "column", "direction", "aggregate", "bucket");
        var id = CanopyFlowContract.RequiredText(map, "column", "Intent level");
        if (!columns.TryGetValue(id, out var column)) throw new InvalidOperationException("An intent level identifies a declared column.");
        return new CanopyGridGroupLevel(id, Direction(map, "Intent level"),
            pivot ? null : CanopyFlowContract.Text(map, "aggregate", "Intent level"), Bucket(map, column));
    }

    internal static void Pivot(object? node, CanopyDataGridView view, IDictionary<string, CanopyColumn> columns) {
        if (view.Reporting == null || !view.Reporting.Pivotable && view.Reporting.Pivot == null)
            throw new InvalidOperationException("This view does not enable pivots.");
        if (node is bool enabled && !enabled) return;
        var map = CanopyFlowContract.Object(node, "Intent pivot", "rows", "columns", "values", "maxColumns", "topNColumns", "sortByTotal");
        var result = new CanopyGridPivot {
            MaxColumns = Integer(map, "maxColumns", 200),
            TopNColumns = map.ContainsKey("topNColumns") ? Integer(map, "topNColumns", 0) : (int?)null
        };
        foreach (var axis in new[] { "rows", "columns" }) {
            if (!map.ContainsKey(axis)) throw new InvalidOperationException("A pivot declares both axes.");
            var levels = CanopyFlowContract.Items(map, axis, "Intent pivot", axis == "rows" ? 4 : 2);
            foreach (var level in levels) (axis == "rows" ? result.Rows : result.Columns).Add(Level(level, columns, true));
        }
        if (!map.ContainsKey("values")) throw new InvalidOperationException("A pivot declares its aggregate values.");
        foreach (var item in CanopyFlowContract.Items(map, "values", "Intent pivot", 32)) {
            if (!(item is string id)) throw new InvalidOperationException("A pivot value is a declared aggregate identity.");
            result.Values.Add(id);
        }
        if (map.TryGetValue("sortByTotal", out var sortNode)) {
            var sort = CanopyFlowContract.Object(sortNode, "Intent total sort", "aggregate", "direction");
            result.SortByTotal = CanopyFlowContract.RequiredText(sort, "aggregate", "Intent total sort");
            result.SortDescending = Direction(sort, "Intent total sort");
        }
        result.Validate(view);
    }

    private static bool Direction(Dictionary<string, object?> map, string what) =>
        CanopyFlowContract.Choose(CanopyFlowContract.RequiredText(map, "direction", what), what, "direction", ("asc", false), ("desc", true));

    private static int Integer(Dictionary<string, object?> map, string name, int fallback) {
        if (!map.ContainsKey(name)) return fallback;
        var number = CanopyFlowContract.Number(map, name, "Intent analysis");
        if (!number.HasValue || number < int.MinValue || number > int.MaxValue || Math.Truncate(number.Value) != number)
            throw new InvalidOperationException("An intent analysis limit is an integer.");
        return (int)number.Value;
    }

    internal static CanopyBucket? Bucket(Dictionary<string, object?> level, CanopyColumn column) {
        if (!level.TryGetValue("bucket", out var node)) return null;
        var map = CanopyFlowContract.Object(node, "Intent bucket", "kind", "width", "origin", "edges", "timeZone", "firstWeekday");
        var kind = CanopyFlowContract.RequiredText(map, "kind", "Intent bucket");
        CanopyBucket result;
        if (kind == "width") {
            CanopyFlowContract.Object(node, "Intent width bucket", "kind", "width", "origin");
            result = CanopyBucket.FixedWidth(CanopyFlowContract.Number(map, "width", "Intent bucket") ?? throw new InvalidOperationException("A width bucket requires width."),
                map.ContainsKey("origin") ? CanopyFlowContract.Number(map, "origin", "Intent bucket") ?? throw new InvalidOperationException("A bucket origin is numeric.") : 0);
        } else if (kind == "edges") {
            CanopyFlowContract.Object(node, "Intent edge bucket", "kind", "edges");
            if (!map.ContainsKey("edges")) throw new InvalidOperationException("An edge bucket declares edges.");
            var items = CanopyFlowContract.Items(map, "edges", "Intent bucket", 200);
            var edges = new double[items.Count];
            for (var index = 0; index < items.Count; index++) {
                if (items[index] is long whole) edges[index] = whole;
                else if (items[index] is double real) edges[index] = real;
                else throw new InvalidOperationException("Bucket edges are numbers.");
            }
            result = CanopyBucket.ExplicitEdges(edges);
        } else {
            CanopyFlowContract.Object(node, "Intent calendar bucket", "kind", "timeZone", "firstWeekday");
            if (!Enum.TryParse<CanopyBucketKind>(kind, true, out var calendar) || calendar.ToString().ToLowerInvariant() != kind)
                throw new InvalidOperationException("Unknown calendar bucket kind.");
            result = CanopyBucket.Calendar(calendar, map.ContainsKey("timeZone") ?
                CanopyFlowContract.RequiredText(map, "timeZone", "Intent bucket") : "UTC", (DayOfWeek)Integer(map, "firstWeekday", 1));
        }
        result.Validate(column);
        return result;
    }
}
