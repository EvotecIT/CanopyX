using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable labelled aggregate bound to one declared raw column.</summary>
public sealed class CanopyGridAggregate {
    /// <summary>Creates a generic aggregate. Numeric operations require a numeric column.</summary>
    /// <param name="id">Stable aggregate identity, independent of the column and display label.</param>
    /// <param name="column">The declared raw column identity.</param>
    /// <param name="operation">The generic aggregate operation.</param>
    /// <param name="label">Plain display text, bounded to 512 characters.</param>
    public CanopyGridAggregate(string id, string column, CanopyGridAggregateOperation operation, string label) {
        CanopyIdentifiers.Require(id, nameof(id)); CanopyIdentifiers.Require(column, nameof(column));
        if (!Enum.IsDefined(typeof(CanopyGridAggregateOperation), operation)) throw new ArgumentOutOfRangeException(nameof(operation));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 512) throw new ArgumentException("An aggregate needs a label of 1 to 512 characters.", nameof(label));
        Id = id; Column = column; Operation = operation; Label = label;
    }
    /// <summary>Gets the stable aggregate identity.</summary>
    public string Id { get; }
    /// <summary>Gets the raw column identity.</summary>
    public string Column { get; }
    /// <summary>Gets the generic operation.</summary>
    public CanopyGridAggregateOperation Operation { get; }
    /// <summary>Gets the plain display label.</summary>
    public string Label { get; }
    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("id", Id).Property("column", Column)
        .Property("operation", OperationName(Operation)).Property("label", Label).EndObject();
    internal static string OperationName(CanopyGridAggregateOperation operation) => operation == CanopyGridAggregateOperation.Count ? "count" :
        operation == CanopyGridAggregateOperation.Sum ? "sum" : operation == CanopyGridAggregateOperation.Average ? "average" :
        operation == CanopyGridAggregateOperation.Minimum ? "minimum" : "maximum";
}
