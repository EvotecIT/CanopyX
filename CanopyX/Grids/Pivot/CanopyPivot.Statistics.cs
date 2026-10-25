using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace CanopyX;

public static partial class CanopyPivot {
    private sealed class Statistics {
        internal Statistics(IReadOnlyList<CanopyGridAggregate> aggregates) {
            Aggregates = aggregates; Values = new double?[aggregates.Count]; Counts = new int[aggregates.Count];
            Distinct = new HashSet<string>?[aggregates.Count]; Custom = new List<CanopyCell?>?[aggregates.Count];
        }
        internal IReadOnlyList<CanopyGridAggregate> Aggregates { get; }
        internal int Count;
        internal double?[] Values;
        internal int[] Counts;
        internal HashSet<string>?[] Distinct;
        internal List<CanopyCell?>?[] Custom;
        internal void Add(CanopyPivotContribution contribution) {
            Count = checked(Count + contribution.Count);
            for (var index = 0; index < Aggregates.Count; index++) {
                var aggregate = Aggregates[index]; var count = contribution.Counts[index]; var value = contribution.Values[index];
                Counts[index] = checked(Counts[index] + count);
                if (aggregate.Operation == CanopyGridAggregateOperation.DistinctCount) {
                    if (contribution.Distinct[index] != null) (Distinct[index] ??= new HashSet<string>(StringComparer.Ordinal)).Add(ScalarKey(contribution.Distinct[index]));
                } else if (aggregate.Operation == CanopyGridAggregateOperation.Custom) {
                    if (count == 0) continue;
                    var cells = Custom[index] ??= new List<CanopyCell?>();
                    if ((long)cells.Count + count > 100000) throw new InvalidOperationException("A custom inline pivot aggregate supports at most 100,000 nonmissing inputs.");
                    var cell = Cell(contribution.Distinct[index]); for (var member = 0; member < count; member++) cells.Add(cell);
                } else if (value.HasValue && count != 0) {
                    var operation = aggregate.Operation;
                    if (operation == CanopyGridAggregateOperation.Minimum) Values[index] = Values[index].HasValue ? Math.Min(Values[index]!.Value, value.Value) : value;
                    else if (operation == CanopyGridAggregateOperation.Maximum) Values[index] = Values[index].HasValue ? Math.Max(Values[index]!.Value, value.Value) : value;
                    else Values[index] = (Values[index] ?? 0) + value * (operation == CanopyGridAggregateOperation.Average ? count : 1);
                }
            }
        }
        internal double? Value(int index, Func<CanopyGridAggregate, IReadOnlyList<CanopyCell?>, double?>? custom) {
            var aggregate = Aggregates[index];
            double? value = aggregate.Operation == CanopyGridAggregateOperation.Count ? Counts[index] :
                aggregate.Operation == CanopyGridAggregateOperation.DistinctCount ? Distinct[index]?.Count ?? 0 :
                aggregate.Operation == CanopyGridAggregateOperation.Custom ? custom?.Invoke(aggregate, Custom[index]?.AsReadOnly() ?? (IReadOnlyList<CanopyCell?>)Array.Empty<CanopyCell?>()) :
                Counts[index] == 0 ? null : aggregate.Operation == CanopyGridAggregateOperation.Average ? Values[index] / Counts[index] : Values[index];
            if (value.HasValue && (!CanopyBucket.Finite(value.Value) || Math.Abs(value.Value) > 9007199254740991d))
                throw new InvalidOperationException("Pivot aggregate values must be finite protocol numbers or null.");
            return value;
        }
        internal CanopyPivotCell Finish(string row, string column, Func<CanopyGridAggregate, IReadOnlyList<CanopyCell?>, double?>? custom) {
            var values = new Dictionary<string, double?>(StringComparer.Ordinal);
            for (var index = 0; index < Aggregates.Count; index++) values.Add(Aggregates[index].Id, Value(index, custom));
            return new CanopyPivotCell(row, column, Count, new ReadOnlyDictionary<string, double?>(values));
        }
    }

    internal static CanopyPivotResult FromContributions(CanopyDataGridView view, CanopyGridPivot definition, IReadOnlyList<CanopyPivotContribution> contributions,
        Func<CanopyGridAggregate, IReadOnlyList<CanopyCell?>, double?>? custom = null) {
        definition.Validate(view);
        if (contributions.Count > 100000) throw new InvalidOperationException("Pivot supports at most 100,000 grouped contributions. Narrow the query or axes.");
        var aggregates = definition.Values.Select(id => view.Reporting!.Aggregates.First(value => value.Id == id)).ToArray();
        if (custom == null && aggregates.Any(aggregate => aggregate.Operation == CanopyGridAggregateOperation.Custom))
            throw new InvalidOperationException("This pivot needs the host's declared custom aggregate evaluator.");
        var columnStats = new Dictionary<string, Statistics>(StringComparer.Ordinal);
        var columnPaths = new Dictionary<string, object?[]>(StringComparer.Ordinal);
        foreach (var contribution in contributions) {
            if (contribution.Count < 1 || contribution.Rows.Length != definition.Rows.Count || contribution.Columns.Length != definition.Columns.Count ||
                contribution.Values.Length != aggregates.Length || contribution.Counts.Length != aggregates.Length || contribution.Distinct.Length != aggregates.Length ||
                contribution.Counts.Any(count => count < 0 || count > contribution.Count)) throw new InvalidOperationException("Invalid pivot contribution.");
            var key = Key("c", contribution.Columns);
            if (!columnStats.TryGetValue(key, out var stats)) { columnStats.Add(key, stats = new Statistics(aggregates)); columnPaths.Add(key, contribution.Columns); }
            stats.Add(contribution);
        }
        var leaves = columnPaths.Keys.ToList();
        var natural = AxisComparer(view, definition.Columns);
        leaves.Sort((left, right) => natural(columnPaths[left], columnPaths[right]));
        var requested = Math.Min(definition.MaxColumns, definition.TopNColumns ?? definition.MaxColumns);
        var limited = leaves.Count > requested;
        if (limited) {
            leaves.Sort((left, right) => {
                var x = columnStats[left].Value(0, custom); var y = columnStats[right].Value(0, custom);
                var score = CompareNumber(x, y, true); return score != 0 ? score : natural(columnPaths[left], columnPaths[right]);
            });
            var retainedCount = Math.Min(requested, definition.MaxColumns - 1);
            leaves = leaves.Take(retainedCount).ToList();
        }
        var kept = new HashSet<string>(leaves, StringComparer.Ordinal);
        var rows = new Dictionary<string, CanopyPivotAxisNode>(StringComparer.Ordinal) { ["r"] = Node("r", Array.Empty<object?>(), 0) };
        var columns = new Dictionary<string, CanopyPivotAxisNode>(StringComparer.Ordinal) { ["c"] = Node("c", Array.Empty<object?>(), 0) };
        foreach (var leaf in leaves) AddNodes(columns, "c", columnPaths[leaf]);
        if (limited) columns.Add("c:other", new CanopyPivotAxisNode("c:other", "c", Array.Empty<CanopyCell?>(), true));
        if ((long)rows.Count * columns.Count * aggregates.Length > 100000) throw new InvalidOperationException("Pivot tables support at most 100,000 display cells. Narrow the query, axes or values.");
        var all = new Dictionary<string, Dictionary<string, Statistics>>(StringComparer.Ordinal);
        var intersections = 0;
        Statistics At(string row, string column) {
            if (!all.TryGetValue(row, out var values)) all.Add(row, values = new Dictionary<string, Statistics>(StringComparer.Ordinal));
            if (!values.TryGetValue(column, out var stats)) {
                if (++intersections > 100000) throw new InvalidOperationException("Pivot supports at most 100,000 populated prefix intersections. Narrow the query or axes.");
                values.Add(column, stats = new Statistics(aggregates));
            }
            return stats;
        }
        At("r", "c");
        foreach (var contribution in contributions) {
            AddNodes(rows, "r", contribution.Rows);
            if ((long)rows.Count * columns.Count * aggregates.Length > 100000) throw new InvalidOperationException("Pivot tables support at most 100,000 display cells. Narrow the query, axes or values.");
            var leaf = Key("c", contribution.Columns); var other = limited && !kept.Contains(leaf);
            for (var rowDepth = 0; rowDepth <= contribution.Rows.Length; rowDepth++) {
                var row = Key("r", contribution.Rows, rowDepth);
                At(row, "c").Add(contribution);
                if (other) At(row, "c:other").Add(contribution);
                // A retained prefix is its full raw scope, including descendants represented in Other.
                // It must agree with a prefix drill-through, distinct union and weighted average.
                for (var columnDepth = 1; columnDepth <= contribution.Columns.Length; columnDepth++) {
                    var column = Key("c", contribution.Columns, columnDepth);
                    if (columns.ContainsKey(column)) At(row, column).Add(contribution);
                }
            }
        }
        var cells = new Dictionary<string, Dictionary<string, CanopyPivotCell>>(StringComparer.Ordinal);
        foreach (var row in all) cells.Add(row.Key, row.Value.ToDictionary(pair => pair.Key, pair => pair.Value.Finish(row.Key, pair.Key, custom), StringComparer.Ordinal));
        var orderedRows = OrderNodes(view, definition.Rows, rows, cells, definition);
        var orderedColumns = OrderNodes(view, definition.Columns, columns, cells, null);
        var paths = leaves.Select(leaf => (IReadOnlyList<CanopyCell?>)Array.AsReadOnly(columnPaths[leaf].Select(Cell).ToArray())).ToArray();
        return new CanopyPivotResult(view, definition, orderedRows, orderedColumns, cells, Array.AsReadOnly(paths), columnPaths.Count, limited);
    }

    private static CanopyPivotAxisNode Node(string axis, object?[] path, int depth) => new CanopyPivotAxisNode(Key(axis, path, depth), depth == 0 ? null : Key(axis, path, depth - 1),
        Array.AsReadOnly(path.Take(depth).Select(Cell).ToArray()));
    private static void AddNodes(IDictionary<string, CanopyPivotAxisNode> nodes, string axis, object?[] path) {
        for (var depth = 1; depth <= path.Length; depth++) {
            var key = Key(axis, path, depth);
            if (!nodes.ContainsKey(key)) {
                if (nodes.Count >= 10001) throw new InvalidOperationException("A pivot axis supports at most 10,000 prefixes.");
                nodes.Add(key, Node(axis, path, depth));
            }
        }
    }
    private static Comparison<IReadOnlyList<object?>> AxisComparer(CanopyDataGridView view, IList<CanopyGridGroupLevel> levels) {
        var comparers = levels.Select(level => level.Bucket == null ? new CanopyGridGrouping(level.Column, level.Descending).CreateComparer(view) :
            Comparer<CanopyCell>.Create((left, right) => CanopyBucket.CompareKeys(left?.Value, right?.Value, level.Descending))).ToArray();
        return (left, right) => {
            for (var index = 0; index < Math.Min(left.Count, right.Count); index++) { var order = comparers[index].Compare(Cell(left[index])!, Cell(right[index])!); if (order != 0) return order; }
            return left.Count.CompareTo(right.Count);
        };
    }
    private static IReadOnlyList<CanopyPivotAxisNode> OrderNodes(CanopyDataGridView view, IList<CanopyGridGroupLevel> levels, Dictionary<string, CanopyPivotAxisNode> nodes,
        Dictionary<string, Dictionary<string, CanopyPivotCell>> cells, CanopyGridPivot? rowDefinition) {
        var compare = AxisComparer(view, levels); var result = new List<CanopyPivotAxisNode>();
        void Visit(CanopyPivotAxisNode node) {
            result.Add(node);
            var children = nodes.Values.Where(child => child.Parent == node.Key).ToList();
            children.Sort((left, right) => {
                if (left.Other || right.Other) return left.Other == right.Other ? 0 : left.Other ? 1 : -1;
                if (rowDefinition?.SortByTotal != null) {
                    var order = CompareNumber(cells[left.Key]["c"].Aggregates[rowDefinition.SortByTotal], cells[right.Key]["c"].Aggregates[rowDefinition.SortByTotal], rowDefinition.SortDescending);
                    if (order != 0) return order;
                }
                return compare(left.Path.Select(cell => cell?.Value).ToArray(), right.Path.Select(cell => cell?.Value).ToArray());
            });
            foreach (var child in children) Visit(child);
        }
        Visit(nodes.Values.First(node => node.Parent == null)); return result.AsReadOnly();
    }
    private static int CompareNumber(double? left, double? right, bool descending) => !left.HasValue || !right.HasValue ? left.HasValue == right.HasValue ? 0 : left.HasValue ? -1 : 1 :
        descending ? right.Value.CompareTo(left.Value) : left.Value.CompareTo(right.Value);
}
