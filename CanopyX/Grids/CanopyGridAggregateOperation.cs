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
    Maximum,
    /// <summary>Counts distinct nonmissing raw values of any column.</summary>
    DistinctCount,
    /// <summary>A named custom aggregate (<see cref="CanopyGridAggregate.CustomOperation"/>): a browser plugin computes it for inline
    /// data and a host source computes it for its own; the value is a finite number or null.</summary>
    Custom,
    /// <summary>The middle finite numeric value: the 50th percentile, interpolated as <see cref="Percentile"/> is. An empty input produces null.</summary>
    Median,
    /// <summary>The value at <see cref="CanopyGridAggregate.Percentile"/> percent of the sorted finite numeric values, interpolated
    /// linearly between the closest ranks (Excel PERCENTILE.INC, NumPy's default). An empty input produces null.</summary>
    Percentile
}
