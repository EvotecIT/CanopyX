using System;

namespace CanopyX.Data;

/// <summary>One validated grouping level of a request: a sortable column and the order of its groups.</summary>
/// <remarks>
/// Levels are ordered, outermost first, at most four. Groups of a level order by their raw value in the level's direction
/// (the protocol's order: ordinal text, numbers and dates by value, missing values last), or, when <see cref="Aggregate"/>
/// is set, by that aggregate's value over each group in the level's direction, missing aggregate values last and equal
/// values by raw value ascending. Records of a group stay contiguous, so a page reads level by level.
/// </remarks>
public sealed class CanopySummaryLevel {
    /// <summary>Creates a level.</summary>
    /// <param name="column">The allowed sortable grouping column.</param>
    /// <param name="descending">Whether groups follow descending order.</param>
    /// <param name="aggregate">The declared aggregate whose value orders the groups, or null to order them by value.</param>
    /// <param name="bucket">Optional calendar or numeric partition.</param>
    public CanopySummaryLevel(CanopyDataColumn column, bool descending, CanopySummaryAggregate? aggregate = null, CanopyBucket? bucket = null) {
        Column = column ?? throw new ArgumentNullException(nameof(column));
        Descending = descending;
        Aggregate = aggregate;
        Bucket = bucket;
    }

    /// <summary>Gets the grouping column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets whether groups follow descending order (of their value, or of <see cref="Aggregate"/>).</summary>
    public bool Descending { get; }

    /// <summary>Gets the declared aggregate whose value orders this level's groups, or null when groups order by value.</summary>
    public CanopySummaryAggregate? Aggregate { get; }

    /// <summary>Gets the optional partition applied before grouping.</summary>
    public CanopyBucket? Bucket { get; }

    internal object? Key(object? value) => Bucket == null ? value : Bucket.Key(value);
}
