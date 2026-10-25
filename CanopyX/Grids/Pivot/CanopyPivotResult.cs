using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A bounded pivot with both axes' prefixes and exact totals, independent of presentation collapse.</summary>
public sealed partial class CanopyPivotResult {
    private readonly Dictionary<string, Dictionary<string, CanopyPivotCell>> _lookup;
    private readonly CanopyDataGridView _view;
    private readonly CanopyGridPivot _definition;
    private readonly HashSet<string> _rowKeys;
    private readonly HashSet<string> _columnKeys;
    internal CanopyPivotResult(CanopyDataGridView view, CanopyGridPivot definition, IReadOnlyList<CanopyPivotAxisNode> rows,
        IReadOnlyList<CanopyPivotAxisNode> columns, Dictionary<string, Dictionary<string, CanopyPivotCell>> cells,
        IReadOnlyList<IReadOnlyList<CanopyCell?>> retained, int distinctColumns, bool limited) {
        _view = view; _definition = definition.Copy(); Rows = rows; Columns = columns; _lookup = cells; RetainedColumns = retained;
        _rowKeys = new HashSet<string>(rows.Select(node => node.Key), StringComparer.Ordinal);
        _columnKeys = new HashSet<string>(columns.Select(node => node.Key), StringComparer.Ordinal);
        DistinctColumns = distinctColumns; ColumnsLimited = limited;
        Cells = Array.AsReadOnly(cells.Values.SelectMany(row => row.Values).ToArray());
        Matched = cells["r"]["c"].Count;
    }
    /// <summary>Gets the record count of the complete accepted query.</summary>
    public int Matched { get; }
    /// <summary>Gets the owning view identity.</summary>
    public string View => _view.Id;
    /// <summary>Gets the definition snapshot. Changes to the returned copy do not change this result.</summary>
    public CanopyGridPivot Definition => _definition.Copy();
    /// <summary>Gets ordered row prefixes, total first and then depth-first sibling order.</summary>
    public IReadOnlyList<CanopyPivotAxisNode> Rows { get; }
    /// <summary>Gets ordered column prefixes, total first. Other, when needed, follows the retained paths.</summary>
    public IReadOnlyList<CanopyPivotAxisNode> Columns { get; }
    /// <summary>Gets the populated intersections, including exact totals for every prefix.</summary>
    public IReadOnlyList<CanopyPivotCell> Cells { get; }
    /// <summary>Gets the number of distinct complete column paths before the cap or top-N selection.</summary>
    public int DistinctColumns { get; }
    /// <summary>Gets whether columns were combined into Other.</summary>
    public bool ColumnsLimited { get; }
    /// <summary>Gets complete retained column paths, used to exclude them from an Other drill-through.</summary>
    public IReadOnlyList<IReadOnlyList<CanopyCell?>> RetainedColumns { get; }
    /// <summary>Gets an intersection or an empty intersection with missing numeric values and zero counts.</summary>
    /// <param name="row">A declared row prefix identity.</param>
    /// <param name="column">A declared column prefix identity.</param>
    /// <returns>The raw aggregate cell.</returns>
    public CanopyPivotCell GetCell(string row, string column) {
        if (!_rowKeys.Contains(row) || !_columnKeys.Contains(column)) throw new ArgumentException("Unknown pivot prefix.");
        if (_lookup.TryGetValue(row, out var columns) && columns.TryGetValue(column, out var value)) return value;
        var values = new Dictionary<string, double?>(StringComparer.Ordinal);
        foreach (var id in _definition.Values) values[id] = _view.Reporting!.Aggregates.First(item => item.Id == id).Counting ? 0 : (double?)null;
        return new CanopyPivotCell(row, column, 0, new ReadOnlyDictionary<string, double?>(values));
    }
    /// <summary>Builds exact membership predicates for the records of a clicked intersection.</summary>
    /// <param name="row">The clicked row prefix.</param>
    /// <param name="column">The clicked column prefix, including Other.</param>
    /// <returns>Zero to two predicates to AND with the accepted query, preserving all existing filters.</returns>
    public IReadOnlyList<CanopyGridTupleFilter> DrillThrough(string row, string column) {
        var rowNode = Rows.FirstOrDefault(node => node.Key == row) ?? throw new ArgumentException("Unknown pivot row.", nameof(row));
        var columnNode = Columns.FirstOrDefault(node => node.Key == column) ?? throw new ArgumentException("Unknown pivot column.", nameof(column));
        var result = new List<CanopyGridTupleFilter>();
        void Add(IList<CanopyGridGroupLevel> levels, IEnumerable<IEnumerable<CanopyCell?>> paths, int width, bool exclude = false) {
            if (width != 0) result.Add(new CanopyGridTupleFilter(levels.Take(width).Select(level => new CanopyGridTupleColumn(level.Column, level.Bucket)), paths, exclude));
        }
        Add(_definition.Rows, new[] { rowNode.Path }, rowNode.Path.Count);
        if (columnNode.Other && RetainedColumns.Count != 0) Add(_definition.Columns, RetainedColumns, _definition.Columns.Count, true);
        else if (!columnNode.Other) Add(_definition.Columns, new[] { columnNode.Path }, columnNode.Path.Count);
        return result.AsReadOnly();
    }
    /// <summary>Writes a data-only pivot result suitable for an optional hosted pivot source.</summary>
    /// <returns>HTML-safe JSON, bounded to four million UTF-16 code units.</returns>
    public string ToJson() {
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridPivot").Property("view", _view.Id).Property("matched", Matched).Property("distinctColumns", DistinctColumns)
            .Property("columnsLimited", ColumnsLimited).Name("definition"); _definition.WriteJson(writer);
        void Axis(string name, IReadOnlyList<CanopyPivotAxisNode> nodes) {
            writer.Name(name).BeginArray();
            foreach (var node in nodes) {
                writer.BeginObject().Property("key", node.Key).OptionalProperty("parent", node.Parent).Property("other", node.Other).Name("path"); WritePath(writer, node.Path); writer.EndObject();
            }
            writer.EndArray();
        }
        Axis("rows", Rows); Axis("columns", Columns);
        writer.Name("retainedColumns").BeginArray(); foreach (var path in RetainedColumns) WritePath(writer, path); writer.EndArray();
        writer.Name("cells").BeginArray();
        foreach (var cell in Cells) {
            writer.BeginObject().Property("row", cell.Row).Property("column", cell.Column).Property("count", cell.Count).Name("aggregates").BeginObject();
            foreach (var value in cell.Aggregates) { writer.Name(value.Key); if (value.Value.HasValue) writer.Number(value.Value.Value); else writer.Null(); }
            writer.EndObject().EndObject();
        }
        var json = writer.EndArray().EndObject().ToString();
        if (json.Length > 4194304) throw new InvalidOperationException("Pivot metadata exceeds four million UTF-16 code units. Narrow the query or axes.");
        return json;
    }
    private static void WritePath(CanopyJsonWriter writer, IReadOnlyList<CanopyCell?> path) {
        writer.BeginArray(); foreach (var value in path) { if (value == null) writer.Null(); else value.WriteValue(writer); } writer.EndArray();
    }
}
