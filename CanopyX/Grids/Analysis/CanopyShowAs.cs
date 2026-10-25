namespace CanopyX;

/// <summary>A display transformation applied after an aggregate has been computed.</summary>
public enum CanopyShowAs {
    /// <summary>The original aggregate value.</summary>
    Value,
    /// <summary>The value divided by the complete-query aggregate.</summary>
    PercentGrandTotal,
    /// <summary>The value divided by its parent group's aggregate.</summary>
    PercentParent,
    /// <summary>The value divided by the total of its pivot column.</summary>
    PercentColumn,
    /// <summary>The value divided by the total of its pivot row.</summary>
    PercentRow,
    /// <summary>The cumulative aggregate in accepted sibling order; missing values do not advance the total.</summary>
    RunningTotal,
    /// <summary>Descending competition rank: ties share a rank and leave a gap.</summary>
    Rank,
    /// <summary>The difference from the immediately preceding sibling; first and missing predecessors return null.</summary>
    Difference,
    /// <summary>The difference from the preceding sibling divided by that sibling; zero and missing denominators return null.</summary>
    PercentChange
}
