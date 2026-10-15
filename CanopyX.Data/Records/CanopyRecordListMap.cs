using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Maps the child rows of a record collection (<see cref="CanopyRecordMap{T}.Collection"/>): their key, columns, order,
/// page size and the grid whose records they are.</summary>
/// <typeparam name="TChild">The child row type.</typeparam>
/// <remarks>
/// Rows come in the same order every time: the <see cref="OrderBy"/> keys (missing values last in both directions), then the
/// child key ascending. Only the mapped columns are read; each column's kind must fit its expression as grid columns do.
/// </remarks>
public sealed class CanopyRecordListMap<TChild> {
    private readonly List<(LambdaExpression Expression, bool Descending)> _orders = new List<(LambdaExpression, bool)>();
    private readonly List<(CanopyColumn Column, LambdaExpression Value, Func<object?, CanopyCell?>? Format)> _columns = new List<(CanopyColumn, LambdaExpression, Func<object?, CanopyCell?>?)>();
    private LambdaExpression? _key;
    private int _pageSize = 50;
    private int? _pageLength;
    private string? _targetView, _targetColumn;

    internal CanopyRecordListMap() { }

    /// <summary>Maps the child key: unique among the record's rows, the row identity (its invariant text) and the final order key.
    /// With <see cref="Target"/>, it is the target grid's record identity.</summary>
    /// <typeparam name="TKey">The key type: text, a GUID or an integer.</typeparam>
    /// <param name="key">The key expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordListMap<TChild> Key<TKey>(Expression<Func<TChild, TKey>> key) {
        if (!RecordKeys.Supported(typeof(TKey))) throw new ArgumentException("A child key is text, a GUID or an integer.", nameof(key));
        _key = key ?? throw new ArgumentNullException(nameof(key));
        return this;
    }

    /// <summary>Maps a column of the collection.</summary>
    /// <typeparam name="TValue">The value type.</typeparam>
    /// <param name="column">The column the nested grid shows (identity, title, kind, presenter).</param>
    /// <param name="value">The value expression.</param>
    /// <param name="format">Creates the cell from the raw value (display text, tone, a link); null converts the value as grid columns do.</param>
    /// <returns>This map.</returns>
    /// <exception cref="ArgumentException">The column is listed twice, there are more than 256, or its kind does not fit the value type.</exception>
    public CanopyRecordListMap<TChild> Column<TValue>(CanopyColumn column, Expression<Func<TChild, TValue>> value, Func<TValue, CanopyCell?>? format = null) {
        if (column == null) throw new ArgumentNullException(nameof(column));
        if (value == null) throw new ArgumentNullException(nameof(value));
        if (_columns.Any(item => item.Column.Id == column.Id)) throw new ArgumentException("Collection column '" + column.Id + "' is mapped twice.", nameof(column));
        if (_columns.Count == 256) throw new ArgumentException("A collection has at most 256 columns.", nameof(column));
        var shape = ValueShapes.Of(typeof(TValue), column.Id);
        if (!ValueShapes.Fits(shape, column.Kind)) throw new ArgumentException("Collection column '" + column.Id + "' is a " + column.Kind + " column and cannot map " + typeof(TValue).Name + ".", nameof(value));
        _columns.Add((column, value, format == null ? null : (Func<object?, CanopyCell?>)(raw => format(raw is TValue typed ? typed : default!))));
        return this;
    }

    /// <summary>Orders the rows by a key before the child key; call again for further keys.</summary>
    /// <typeparam name="TKey">The order key type.</typeparam>
    /// <param name="key">The order key expression.</param>
    /// <param name="descending">True for descending order (missing values still come last).</param>
    /// <returns>This map.</returns>
    public CanopyRecordListMap<TChild> OrderBy<TKey>(Expression<Func<TChild, TKey>> key, bool descending = false) {
        _orders.Add((key ?? throw new ArgumentNullException(nameof(key)), descending));
        return this;
    }

    /// <summary>Sets how many rows a whole record carries and Load more asks for, 1 to 10,000 (capped by
    /// <see cref="CanopyRemoteLimits.MaxRecordPageSize"/>). Default 50.</summary>
    /// <param name="rows">The page size.</param>
    /// <returns>This map.</returns>
    public CanopyRecordListMap<TChild> PageSize(int rows) {
        if (rows < 1 || rows > 10000) throw new ArgumentOutOfRangeException(nameof(rows), rows, "A collection page holds 1 to 10,000 rows.");
        _pageSize = rows;
        return this;
    }

    /// <summary>Sets how many rows a page of the nested grid shows, 1 to 100. Default 10.</summary>
    /// <param name="rows">The rows per nested page.</param>
    /// <returns>This map.</returns>
    public CanopyRecordListMap<TChild> PageLength(int rows) {
        if (rows < 1 || rows > 100) throw new ArgumentOutOfRangeException(nameof(rows), rows, "A nested page shows 1 to 100 rows.");
        _pageLength = rows;
        return this;
    }

    /// <summary>Names the grid whose records the rows are: a row opens its record there (the child key is its identity), and
    /// "Open all in grid" filters that grid by <paramref name="column"/> in the rows' identities.</summary>
    /// <param name="view">The target grid identity.</param>
    /// <param name="column">The target grid's column that holds the identities; null leaves "Open all in grid" to the host.</param>
    /// <returns>This map.</returns>
    public CanopyRecordListMap<TChild> Target(string view, string? column = null) {
        _ = new CanopyRecordTarget(view) { Column = column };
        _targetView = view;
        _targetColumn = column;
        return this;
    }

    internal ChildSpec<TChild> Build(string field) {
        var key = _key ?? throw new InvalidOperationException("Collection '" + field + "' needs a child key (Key).");
        if (_columns.Count == 0) throw new InvalidOperationException("Collection '" + field + "' needs at least one column.");
        var columns = _columns.Select(item => item.Column).ToList();
        var formats = _columns.Select(item => item.Format).ToList();
        int pageSize = _pageSize;
        int? pageLength = _pageLength;
        string? targetView = _targetView, targetColumn = _targetColumn;
        return new ChildSpec<TChild>(key, _orders.ToList(), _columns.Select(item => item.Value).ToList(), true, pageSize, (rows, total) => {
            var list = new CanopyRecordList { Total = total, PageSize = pageSize, PageLength = pageLength };
            foreach (var column in columns) list.Columns.Add(column);
            if (targetView != null) list.Target = new CanopyRecordTarget(targetView) { Column = targetColumn };
            foreach (var values in rows) {
                var row = new CanopyGridRow(RecordKeys.Format(values[0]) ?? throw new InvalidOperationException("Collection '" + field + "' has a row without a key."));
                for (var i = 0; i < columns.Count; i++) {
                    var cell = formats[i] != null ? formats[i]!(values[i + 1]) : CanopyDataValues.ToCell(values[i + 1]);
                    if (cell != null) row.Cells[columns[i].Id] = cell;
                }
                list.Rows.Add(row);
            }
            return CanopyCell.Collection(list);
        });
    }
}
