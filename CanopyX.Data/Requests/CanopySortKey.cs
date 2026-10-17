using System;

namespace CanopyX.Data;

/// <summary>One validated sort key. Missing values sort last in either direction.</summary>
public sealed class CanopySortKey {
    /// <summary>Creates a sort key.</summary>
    /// <param name="column">The allowed sortable column.</param>
    /// <param name="descending">True for descending order.</param>
    public CanopySortKey(CanopyDataColumn column, bool descending) {
        Column = column ?? throw new ArgumentNullException(nameof(column));
        Descending = descending;
    }

    /// <summary>Gets the column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets whether the key sorts descending.</summary>
    public bool Descending { get; }
}
