using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Maps typed host records into declared grid columns without reflection or runtime dependencies.</summary>
/// <typeparam name="T">The host's record type.</typeparam>
/// <remarks>Column definitions remain mutable and are reused by created views. Mapping computes no domain facts.</remarks>
public sealed class CanopyGridMapper<T> {
    private readonly Func<T, string> _identity;
    private readonly List<KeyValuePair<CanopyColumn, Func<T, CanopyCell>>> _columns = new List<KeyValuePair<CanopyColumn, Func<T, CanopyCell>>>();

    /// <summary>Creates a mapper using a stable record identity selector.</summary>
    /// <param name="identity">Returns a stable, nonempty identity for each record.</param>
    public CanopyGridMapper(Func<T, string> identity) => _identity = identity ?? throw new ArgumentNullException(nameof(identity));

    /// <summary>Adds one column and its typed cell selector. Returns this mapper for chaining.</summary>
    /// <param name="column">The reusable column definition.</param>
    /// <param name="cell">Maps a record to its raw value and optional presentation.</param>
    /// <returns>This mapper.</returns>
    /// <exception cref="ArgumentException">The column identity is already mapped.</exception>
    public CanopyGridMapper<T> AddColumn(CanopyColumn column, Func<T, CanopyCell> cell) {
        if (column == null) throw new ArgumentNullException(nameof(column));
        if (cell == null) throw new ArgumentNullException(nameof(cell));
        foreach (var mapping in _columns) if (mapping.Key.Id == column.Id) throw new ArgumentException("Duplicate mapped column: " + column.Id, nameof(column));
        _columns.Add(new KeyValuePair<CanopyColumn, Func<T, CanopyCell>>(column, cell));
        return this;
    }

    /// <summary>Maps one host record into a row. The owning view or page validates typed cells and dataset identity uniqueness.</summary>
    /// <param name="record">The record to map.</param>
    /// <returns>A row containing the declared cells.</returns>
    public CanopyGridRow MapRow(T record) {
        var row = new CanopyGridRow(_identity(record));
        foreach (var mapping in _columns) row.Cells.Add(mapping.Key.Id, mapping.Value(record));
        return row;
    }

    /// <summary>Creates and validates a view from typed records and optional host configuration.</summary>
    /// <param name="id">The view identity.</param>
    /// <param name="label">The visible view label.</param>
    /// <param name="records">Complete inline records, or null for a hosted definition.</param>
    /// <param name="configure">Configures the view before its records are mapped and validated.</param>
    /// <returns>The validated view.</returns>
    public CanopyDataGridView CreateView(string id, string label, IEnumerable<T>? records = null, Action<CanopyDataGridView>? configure = null) {
        var view = new CanopyDataGridView(id, label);
        foreach (var mapping in _columns) view.Columns.Add(mapping.Key);
        configure?.Invoke(view);
        if (records != null) foreach (var record in records) view.Rows.Add(MapRow(record));
        view.Validate();
        return view;
    }
}
