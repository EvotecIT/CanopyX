using System.Collections.Generic;

namespace CanopyX;

/// <summary>The record count and raw aggregates at an intersection of row and column prefixes.</summary>
public sealed class CanopyPivotCell {
    internal CanopyPivotCell(string row, string column, int count, IReadOnlyDictionary<string, double?> aggregates) {
        Row = row; Column = column; Count = count; Aggregates = aggregates;
    }
    /// <summary>Gets the row prefix identity.</summary>
    public string Row { get; }
    /// <summary>Gets the column prefix identity.</summary>
    public string Column { get; }
    /// <summary>Gets the matching record count, independent of missing aggregate inputs.</summary>
    public int Count { get; }
    /// <summary>Gets the unchanged raw numeric aggregates.</summary>
    public IReadOnlyDictionary<string, double?> Aggregates { get; }
}
