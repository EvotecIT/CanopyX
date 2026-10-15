using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>One group of a grouped summary: its raw value, record count and aggregates.</summary>
public sealed class CanopySummaryGroup {
    /// <summary>Creates a group.</summary>
    /// <param name="value">The exact raw grouping value; null for missing values.</param>
    /// <param name="count">The positive record count.</param>
    /// <param name="aggregates">Group values keyed by declared aggregate identity.</param>
    public CanopySummaryGroup(object? value, int count, IReadOnlyDictionary<string, double?> aggregates) {
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        Value = CanopyDataValues.Normalize(value);
        Count = count;
        Aggregates = aggregates ?? throw new ArgumentNullException(nameof(aggregates));
    }

    /// <summary>Gets the normalized raw grouping value.</summary>
    public object? Value { get; }

    /// <summary>Gets the record count.</summary>
    public int Count { get; }

    /// <summary>Gets the group aggregate values.</summary>
    public IReadOnlyDictionary<string, double?> Aggregates { get; }
}
