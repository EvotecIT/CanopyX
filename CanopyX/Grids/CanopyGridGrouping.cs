using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Fixed single-column flat grouping; paging continues to count records, not headings.</summary>
/// <remarks>The grouping column leads query ordering. Hosts provide contiguous complete-query group ranges.
/// Collapse state affects presentation only and never narrows selection or export scope.</remarks>
public sealed class CanopyGridGrouping {
    /// <summary>Creates a group policy for a declared sortable column.</summary>
    /// <param name="column">Raw grouping column. Missing and null values form one group.</param>
    /// <param name="descending">Whether groups use descending order; missing values remain last.</param>
    public CanopyGridGrouping(string column, bool descending = false) {
        CanopyIdentifiers.Require(column, nameof(column)); Column = column; Descending = descending;
    }
    /// <summary>Gets the declared grouping column.</summary>
    public string Column { get; }
    /// <summary>Gets whether group order is descending.</summary>
    public bool Descending { get; }
    /// <summary>Creates the group-value comparer used by complete-query host ordering.</summary>
    /// <param name="view">Owning definition containing this grouping column and optional text order.</param>
    /// <returns>A comparer with missing values last and exact raw-value ties separating groups.</returns>
    /// <remarks>Use this key before secondary row sorts and stable record identity. Display text is ignored.</remarks>
    public IComparer<CanopyCell> CreateComparer(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        CanopyColumn? column = null;
        foreach (var declared in view.Columns) if (declared.Id == Column) column = declared;
        if (column == null || !column.Sortable) throw new InvalidOperationException("Grouping needs its declared sortable column.");
        var order = column.Ordering;
        return Comparer<CanopyCell>.Create((left, right) => Compare(left?.Value, right?.Value, column, order));
    }
    private int Compare(object? left, object? right, CanopyColumn column, CanopyGridOrdering? order) {
        CanopyGridValues.Validate(left, column); CanopyGridValues.Validate(right, column);
        if (column.Kind == CanopyColumnKind.Number) {
            if (left != null) left = Number(left);
            if (right != null) right = Number(right);
        }
        if (left == null || right == null) return left == right ? 0 : left == null ? 1 : -1;
        int result;
        if (column.Kind == CanopyColumnKind.Number) result = ((double)left).CompareTo((double)right);
        else if (column.Kind == CanopyColumnKind.DateTime) result = (((DateTime)left).Ticks / TimeSpan.TicksPerMillisecond).CompareTo(((DateTime)right).Ticks / TimeSpan.TicksPerMillisecond);
        else {
            var a = left is bool flagA ? flagA ? "true" : "false" : (string)left;
            var b = right is bool flagB ? flagB ? "true" : "false" : (string)right;
            result = order?.Compare(a, b) ?? string.CompareOrdinal(a, b);
            if (result == 0) result = left is bool && right is string ? -1 : left is string && right is bool ? 1 : string.CompareOrdinal(a, b);
        }
        return Descending ? -result : result;
    }
    private static double Number(object value) {
        var number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
        if (Math.Abs(number) > 9007199254740991d)
            throw new InvalidOperationException("Numeric group values must stay within the safe integer magnitude.");
        return number;
    }
    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("column", Column)
        .Property("direction", Descending ? "desc" : "asc").EndObject();
}
