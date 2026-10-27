using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>Maps the bounded proposal subset into the existing grid query types; those types own query semantics.</summary>
internal static class CanopyViewIntentQuery {
    internal static CanopyGridQuery Read(Dictionary<string, object?> map, CanopyDataGridView view, IDictionary<string, CanopyColumn> columns) {
        var query = new CanopyGridQuery(view.Id) { Search = CanopyFlowContract.Text(map, "search", "Intent query") };
        if (query.Search != null && query.Search.Length > 16384) throw new InvalidOperationException("An intent search holds at most 16,384 characters.");
        if (map.ContainsKey("searchMode")) query.SearchMode = CanopyFlowContract.Choose(CanopyFlowContract.Text(map, "searchMode", "Intent query"), "Intent query", "searchMode",
            ("substring", CanopyGridSearchMode.Substring), ("words", CanopyGridSearchMode.Words));
        foreach (var item in CanopyFlowContract.Items(map, "sort", "Intent query", 64)) {
            var sort = CanopyFlowContract.Object(item, "Intent sort", "column", "direction");
            query.Sort.Add(new CanopyGridSort(CanopyFlowContract.RequiredText(sort, "column", "Intent sort"), Descending(sort, "Intent sort")));
        }
        foreach (var item in CanopyFlowContract.Items(map, "filters", "Intent query", 64)) query.Filters.Add(Filter(item, columns));
        foreach (var item in CanopyFlowContract.Items(map, "tupleFilters", "Intent query", 8)) query.TupleFilters.Add(TupleFilter(item, columns));
        var predicates = query.Filters.Count;
        var groups = 0;
        if (map.TryGetValue("filterGroup", out var group) && group != null) query.FilterGroup = Group(group, columns, 1, ref predicates, ref groups);
        if (map.ContainsKey("groupBy")) {
            query.GroupBy = new List<CanopyGridGroupLevel>();
            foreach (var item in CanopyFlowContract.Items(map, "groupBy", "Intent query", 4))
                query.GroupBy.Add(CanopyViewIntentAnalysis.Level(item, columns, false));
        }
        return query;
    }

    private static bool Descending(Dictionary<string, object?> map, string what) =>
        CanopyFlowContract.Choose(CanopyFlowContract.RequiredText(map, "direction", what), what, "direction", ("asc", false), ("desc", true));

    private static CanopyGridFilter Filter(object? node, IDictionary<string, CanopyColumn> columns) {
        var map = CanopyFlowContract.Object(node, "Intent filter", "column", "operator", "values", "bucket");
        var id = CanopyFlowContract.RequiredText(map, "column", "Intent filter");
        if (!columns.TryGetValue(id, out var column)) throw new InvalidOperationException("An intent filter must identify a declared column.");
        var op = CanopyFlowContract.Choose(CanopyFlowContract.RequiredText(map, "operator", "Intent filter"), "Intent filter", "operator",
            ("eq", CanopyGridFilterOperator.Equal), ("ne", CanopyGridFilterOperator.NotEqual), ("contains", CanopyGridFilterOperator.Contains),
            ("startsWith", CanopyGridFilterOperator.StartsWith), ("in", CanopyGridFilterOperator.In), ("gt", CanopyGridFilterOperator.GreaterThan),
            ("ge", CanopyGridFilterOperator.GreaterThanOrEqual), ("lt", CanopyGridFilterOperator.LessThan), ("le", CanopyGridFilterOperator.LessThanOrEqual),
            ("isNull", CanopyGridFilterOperator.IsNull), ("isNotNull", CanopyGridFilterOperator.IsNotNull));
        if (!map.ContainsKey("values")) throw new InvalidOperationException("An intent filter requires its raw operand array.");
        var bucket = CanopyViewIntentAnalysis.Bucket(map, column);
        var items = CanopyFlowContract.Items(map, "values", "Intent filter", 1000);
        var values = new CanopyCell[items.Count];
        for (var index = 0; index < items.Count; index++) values[index] = Operand(items[index], column, bucket != null);
        return new CanopyGridFilter(id, op, values) { Bucket = bucket };
    }

    private static CanopyGridTupleFilter TupleFilter(object? node, IDictionary<string, CanopyColumn> columns) {
        var map = CanopyFlowContract.Object(node, "Intent tuple filter", "columns", "values", "exclude");
        var fields = new List<CanopyGridTupleColumn>();
        var declared = new List<CanopyColumn>();
        foreach (var item in CanopyFlowContract.Items(map, "columns", "Intent tuple filter", 6)) {
            var field = CanopyFlowContract.Object(item, "Intent tuple column", "column", "bucket");
            var id = CanopyFlowContract.RequiredText(field, "column", "Intent tuple column");
            if (!columns.TryGetValue(id, out var column)) throw new InvalidOperationException("An intent tuple field identifies a declared column.");
            fields.Add(new CanopyGridTupleColumn(id, CanopyViewIntentAnalysis.Bucket(field, column)));
            declared.Add(column);
        }
        var rows = new List<IEnumerable<CanopyCell?>>();
        foreach (var item in CanopyFlowContract.Items(map, "values", "Intent tuple filter", 200)) {
            if (!(item is List<object?> row) || row.Count != fields.Count)
                throw new InvalidOperationException("Intent tuple widths must match their fields.");
            var cells = new CanopyCell?[row.Count];
            for (var index = 0; index < row.Count; index++)
                cells[index] = row[index] == null ? null : Operand(row[index], declared[index], fields[index].Bucket != null);
            rows.Add(cells);
        }
        return new CanopyGridTupleFilter(fields, rows, CanopyFlowContract.Boolean(map, "exclude", "Intent tuple filter") ?? false);
    }

    private static CanopyCell Operand(object? value, CanopyColumn column, bool bucketed = false) {
        if (bucketed) {
            if (value is long key) return new CanopyCell(key);
            if (value is double numericKey) return new CanopyCell(numericKey);
            throw new InvalidOperationException("An intent bucket operand must be a numeric key.");
        }
        if (value is string text) {
            if (text.Length > 16384) throw new InvalidOperationException("An intent operand holds at most 16,384 characters.");
            if (column.Kind != CanopyColumnKind.DateTime) return new CanopyCell(text);
            // Match the grid's UTC wire values; calendar-invalid strings must never normalize to another date.
            if (!DateTime.TryParseExact(text, new[] { "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'" },
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var moment))
                throw new InvalidOperationException("An intent date operand must be an ISO 8601 UTC timestamp.");
            return new CanopyCell(moment);
        }
        if (value is bool flag) return new CanopyCell(flag);
        if (value is long whole) return new CanopyCell(whole);
        if (value is double real) return new CanopyCell(real);
        throw new InvalidOperationException("An intent operand must be a non-null raw scalar.");
    }

    private static CanopyGridFilterGroup Group(object? node, IDictionary<string, CanopyColumn> columns, int depth, ref int predicates, ref int groups) {
        if (depth > 8 || ++groups > 64) throw new InvalidOperationException("Intent groups exceed the grid depth or count limit.");
        var map = CanopyFlowContract.Object(node, "Intent filter group", "operator", "filters", "groups");
        var junction = CanopyFlowContract.Choose(CanopyFlowContract.RequiredText(map, "operator", "Intent filter group"), "Intent filter group", "operator",
            ("and", CanopyGridFilterJunction.All), ("or", CanopyGridFilterJunction.Any));
        if (!map.ContainsKey("filters") || !map.ContainsKey("groups")) throw new InvalidOperationException("Intent groups require filters and groups arrays.");
        var result = new CanopyGridFilterGroup(junction);
        foreach (var item in CanopyFlowContract.Items(map, "filters", "Intent filter group", 64)) {
            if (++predicates > 64) throw new InvalidOperationException("An intent supports at most 64 total predicates.");
            result.Filters.Add(Filter(item, columns));
        }
        foreach (var child in CanopyFlowContract.Items(map, "groups", "Intent filter group", 64)) result.Groups.Add(Group(child, columns, depth + 1, ref predicates, ref groups));
        return result;
    }
}
