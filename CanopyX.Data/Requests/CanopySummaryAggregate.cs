using System;

namespace CanopyX.Data;

/// <summary>One declared aggregate of a summary request.</summary>
/// <remarks>
/// <see cref="CanopyGridAggregateOperation.Count"/> counts nonmissing values in any column. The other operations read
/// number columns, skip missing values and yield null when a group has no values.
/// </remarks>
public sealed class CanopySummaryAggregate {
    /// <summary>Creates an aggregate binding.</summary>
    /// <param name="id">The declared aggregate identity.</param>
    /// <param name="column">The aggregated column.</param>
    /// <param name="operation">The operation.</param>
    public CanopySummaryAggregate(string id, CanopyDataColumn column, CanopyGridAggregateOperation operation) {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Column = column ?? throw new ArgumentNullException(nameof(column));
        Operation = operation;
    }

    /// <summary>Gets the declared aggregate identity.</summary>
    public string Id { get; }

    /// <summary>Gets the aggregated column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets the operation.</summary>
    public CanopyGridAggregateOperation Operation { get; }
}
