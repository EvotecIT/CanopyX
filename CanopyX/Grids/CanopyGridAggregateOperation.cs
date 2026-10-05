namespace CanopyX;

/// <summary>A generic aggregate over raw values of the complete accepted query.</summary>
public enum CanopyGridAggregateOperation {
    /// <summary>Counts nonmissing values; the response also carries the separate record count.</summary>
    Count,
    /// <summary>Sums finite numeric values. An empty input produces null.</summary>
    Sum,
    /// <summary>Averages finite numeric values. An empty input produces null.</summary>
    Average,
    /// <summary>Returns the smallest finite numeric value. An empty input produces null.</summary>
    Minimum,
    /// <summary>Returns the largest finite numeric value. An empty input produces null.</summary>
    Maximum
}
