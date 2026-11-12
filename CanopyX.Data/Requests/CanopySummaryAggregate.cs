using System;

namespace CanopyX.Data;

/// <summary>One declared aggregate of a summary request.</summary>
/// <remarks>
/// <see cref="CanopyGridAggregateOperation.Count"/> counts nonmissing values and <see cref="CanopyGridAggregateOperation.DistinctCount"/>
/// distinct nonmissing protocol values, in any column. The other built-in operations read number columns, skip missing values
/// and yield null when a group has no values. <see cref="CanopyGridAggregateOperation.Median"/> and
/// <see cref="CanopyGridAggregateOperation.Percentile"/> interpolate linearly between the closest ranks; the in-memory provider
/// computes them, a translated query answers them only in pivots (see <c>docs/remote-dotnet.md</c>). A <see cref="CanopyGridAggregateOperation.Custom"/> aggregate names its
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
        if (operation == CanopyGridAggregateOperation.Percentile) throw new ArgumentException("A percentile aggregate names its percentile.", nameof(operation));
        Operation = operation;
        CustomOperation = customOperation;
    }

    /// <summary>Creates a percentile aggregate binding.</summary>
    /// <param name="id">The declared aggregate identity.</param>
    /// <param name="column">The aggregated number column.</param>
    /// <param name="percentile">The percentile, greater than 0 and less than 100.</param>
    public CanopySummaryAggregate(string id, CanopyDataColumn column, double percentile) : this(id, column, CanopyGridAggregateOperation.Median) {
        if (double.IsNaN(percentile) || percentile <= 0 || percentile >= 100) throw new ArgumentOutOfRangeException(nameof(percentile), "A percentile is greater than 0 and less than 100.");
        Operation = CanopyGridAggregateOperation.Percentile;
        Percentile = percentile;
    }

    /// <summary>Gets the declared aggregate identity.</summary>
    public string Id { get; }

    /// <summary>Gets the aggregated column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets the operation.</summary>
    public CanopyGridAggregateOperation Operation { get; }

    /// <summary>Gets the operation name of a custom aggregate, or null for a built-in operation.</summary>
    public string? CustomOperation { get; }

    /// <summary>Gets the percentile of a <see cref="CanopyGridAggregateOperation.Percentile"/> aggregate, or null.</summary>
    public double? Percentile { get; }

    /// <summary>Whether the value is a median or percentile, which needs every value of its group rather than a running total.</summary>
    internal bool Ranked => Operation == CanopyGridAggregateOperation.Median || Operation == CanopyGridAggregateOperation.Percentile;

    /// <summary>The equivalent view aggregate, which evaluates built-in operations over cells.</summary>
    internal CanopyGridAggregate Definition() => Percentile.HasValue ? CanopyGridAggregate.AtPercentile(Id, Column.Id, Percentile.Value, Id) :
        new CanopyGridAggregate(Id, Column.Id, Operation, Id);

    /// <summary>Whether the value counts records (count, distinct count): a whole number within the group's record count.</summary>
    internal bool Counting => Operation == CanopyGridAggregateOperation.Count || Operation == CanopyGridAggregateOperation.DistinctCount;
}
