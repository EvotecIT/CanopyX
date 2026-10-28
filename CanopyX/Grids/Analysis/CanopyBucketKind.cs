namespace CanopyX;

/// <summary>The calendar or numeric partition used by a grouping level or facet.</summary>
public enum CanopyBucketKind {
    /// <summary>One local calendar day.</summary>
    Day,
    /// <summary>One seven-day week; Monday and ISO week years are the defaults.</summary>
    Week,
    /// <summary>One local calendar month.</summary>
    Month,
    /// <summary>One local calendar quarter.</summary>
    Quarter,
    /// <summary>One local calendar year.</summary>
    Year,
    /// <summary>The local hour, zero through twenty-three, across all dates.</summary>
    Hour,
    /// <summary>The weekday, ordered from the configured first weekday.</summary>
    Weekday,
    /// <summary>Equal-width half-open numeric intervals anchored at an origin.</summary>
    Width,
    /// <summary>Half-open numeric intervals separated by explicit ascending edges.</summary>
    Edges
}
