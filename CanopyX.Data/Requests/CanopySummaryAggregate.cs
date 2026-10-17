using System;

namespace CanopyX.Data;

/// <summary>One declared aggregate of a summary request.</summary>
/// <remarks>
/// <see cref="CanopyGridAggregateOperation.Count"/> counts nonmissing values and <see cref="CanopyGridAggregateOperation.DistinctCount"/>
/// distinct nonmissing protocol values, in any column. The other built-in operations read number columns, skip missing values
/// and yield null when a group has no values. A <see cref="CanopyGridAggregateOperation.Custom"/> aggregate names its
/// operation in <see cref="CustomOperation"/>; only a provider that knows that operation computes it, the built-in
/// providers answer <see cref="CanopyRequestError.Unsupported"/>.
/// </remarks>
public sealed class CanopySummaryAggregate {
    /// <summary>Creates an aggregate binding.</summary>
    /// <param name="id">The declared aggregate identity.</param>
    /// <param name="column">The aggregated column.</param>
    /// <param name="operation">The operation.</param>
    /// <param name="customOperation">The operation name of a <see cref="CanopyGridAggregateOperation.Custom"/> aggregate; null otherwise.</param>
    public CanopySummaryAggregate(string id, CanopyDataColumn column, CanopyGridAggregateOperation operation, string? customOperation = null) {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Column = column ?? throw new ArgumentNullException(nameof(column));
        if ((operation == CanopyGridAggregateOperation.Custom) != (customOperation != null))
            throw new ArgumentException("A custom aggregate, and only a custom aggregate, names its operation.", nameof(customOperation));
        Operation = operation;
        CustomOperation = customOperation;
    }

    /// <summary>Gets the declared aggregate identity.</summary>
    public string Id { get; }

    /// <summary>Gets the aggregated column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets the operation.</summary>
    public CanopyGridAggregateOperation Operation { get; }

    /// <summary>Gets the operation name of a custom aggregate, or null for a built-in operation.</summary>
    public string? CustomOperation { get; }

    /// <summary>Whether the value counts records (count, distinct count): a whole number within the group's record count.</summary>
    internal bool Counting => Operation == CanopyGridAggregateOperation.Count || Operation == CanopyGridAggregateOperation.DistinctCount;
}
