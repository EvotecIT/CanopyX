using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A bounded cross-tabulation of declared columns and aggregates.</summary>
public sealed class CanopyGridPivot {
    /// <summary>Gets up to four row levels, outermost first.</summary>
    public IList<CanopyGridGroupLevel> Rows { get; } = new List<CanopyGridGroupLevel>();
    /// <summary>Gets up to two column levels, outermost first.</summary>
    public IList<CanopyGridGroupLevel> Columns { get; } = new List<CanopyGridGroupLevel>();
    /// <summary>Gets one to 32 declared aggregate identities.</summary>
    public IList<string> Values { get; } = new List<string>();
    /// <summary>Gets or sets the maximum leaf columns, including Other, from one to 200.</summary>
    public int MaxColumns { get; set; } = 200;
    /// <summary>Gets or sets an optional number of highest-total columns retained before Other.</summary>
    public int? TopNColumns { get; set; }
    /// <summary>Gets or sets an aggregate identity whose row total orders sibling rows.</summary>
    public string? SortByTotal { get; set; }
    /// <summary>Gets or sets whether the row-total order is descending.</summary>
    public bool SortDescending { get; set; } = true;

    internal void Validate(CanopyDataGridView view) {
        var reporting = view.Reporting ?? throw new InvalidOperationException("A pivot needs reporting aggregates.");
        if (Rows.Count > 4 || Columns.Count > 2 || Values.Count < 1 || Values.Count > 32 || MaxColumns < 1 || MaxColumns > 200 ||
            TopNColumns.HasValue && (TopNColumns < 1 || TopNColumns > 200)) throw new InvalidOperationException("Pivot axes, values and column limits exceed their bounds.");
        reporting.ValidateLevels(Rows, view.Columns); reporting.ValidateLevels(Columns, view.Columns);
        foreach (var level in Rows.Concat(Columns)) {
            var column = view.Columns.First(item => item.Id == level.Column);
            if (!column.Filterable || level.Aggregate != null) throw new InvalidOperationException("Pivot axes require filterable sortable columns; use SortByTotal to order rows by a value.");
        }
        var declared = new HashSet<string>(reporting.Aggregates.Select(value => value.Id), StringComparer.Ordinal);
        if (Values.Distinct(StringComparer.Ordinal).Count() != Values.Count || Values.Any(value => !declared.Contains(value)) ||
            SortByTotal != null && !Values.Contains(SortByTotal)) throw new InvalidOperationException("Pivot values and its total sort must reference declared aggregates.");
    }
    internal CanopyGridPivot Copy() {
        var copy = new CanopyGridPivot { MaxColumns = MaxColumns, TopNColumns = TopNColumns, SortByTotal = SortByTotal, SortDescending = SortDescending };
        foreach (var row in Rows) copy.Rows.Add(row); foreach (var column in Columns) copy.Columns.Add(column); foreach (var value in Values) copy.Values.Add(value);
        return copy;
    }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("rows").BeginArray(); foreach (var row in Rows) row.WriteJson(writer);
        writer.EndArray().Name("columns").BeginArray(); foreach (var column in Columns) column.WriteJson(writer);
        writer.EndArray().Name("values").BeginArray(); foreach (var value in Values) writer.String(value);
        writer.EndArray().Property("maxColumns", MaxColumns);
        if (TopNColumns.HasValue) writer.Property("topNColumns", TopNColumns.Value);
        if (SortByTotal != null) writer.Name("sortByTotal").BeginObject().Property("aggregate", SortByTotal).Property("direction", SortDescending ? "desc" : "asc").EndObject();
        writer.EndObject();
    }
}
