using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>One group of a grouped summary: its raw value, record count, aggregates and, below an outer level, its inner groups.</summary>
public sealed class CanopySummaryGroup {
    /// <summary>Creates a group of the innermost level.</summary>
    /// <param name="value">The exact raw grouping value; null for missing values.</param>
    /// <param name="count">The positive record count.</param>
    /// <param name="aggregates">Group values keyed by declared aggregate identity.</param>
    public CanopySummaryGroup(object? value, int count, IReadOnlyDictionary<string, double?> aggregates)
        : this(value, count, aggregates, null) { }

    /// <summary>Creates a group with the groups of the next level inside it.</summary>
    /// <param name="value">The exact raw grouping value; null for missing values.</param>
    /// <param name="count">The positive record count.</param>
    /// <param name="aggregates">Group values keyed by declared aggregate identity.</param>
    /// <param name="groups">The next level's groups inside this group (in any order), or null for a group of the innermost level.</param>
    public CanopySummaryGroup(object? value, int count, IReadOnlyDictionary<string, double?> aggregates, IEnumerable<CanopySummaryGroup>? groups) {
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        Value = CanopyDataValues.Normalize(value);
        Count = count;
        Aggregates = aggregates ?? throw new ArgumentNullException(nameof(aggregates));
        Groups = groups == null ? Array.Empty<CanopySummaryGroup>() : new ReadOnlyCollection<CanopySummaryGroup>(new List<CanopySummaryGroup>(groups));
    }

    /// <summary>Gets the normalized raw grouping value.</summary>
    public object? Value { get; }

    /// <summary>Gets the record count.</summary>
    public int Count { get; }

    /// <summary>Gets the group aggregate values.</summary>
    public IReadOnlyDictionary<string, double?> Aggregates { get; }

    /// <summary>Gets the next level's groups inside this group; empty for a group of the innermost level.</summary>
    public IReadOnlyList<CanopySummaryGroup> Groups { get; }
}
