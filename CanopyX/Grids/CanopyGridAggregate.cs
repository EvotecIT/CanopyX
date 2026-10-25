using System;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable labelled aggregate bound to one declared raw column.</summary>
public sealed partial class CanopyGridAggregate {
    /// <summary>Creates a generic aggregate. Numeric operations require a numeric column.</summary>
    /// <param name="id">Stable aggregate identity, independent of the column and display label.</param>
    /// <param name="column">The declared raw column identity.</param>
    /// <param name="operation">The generic aggregate operation.</param>
    /// <param name="label">Plain display text, bounded to 512 characters.</param>
    public CanopyGridAggregate(string id, string column, CanopyGridAggregateOperation operation, string label) : this(id, column, operation, label, null) { }
    /// <summary>Creates a generic aggregate with an explicit display format. Numeric operations require a numeric column.</summary>
    /// <param name="id">Stable aggregate identity, independent of the column and display label.</param>
    /// <param name="column">The declared raw column identity.</param>
    /// <param name="operation">The generic aggregate operation.</param>
    /// <param name="label">Plain display text, bounded to 512 characters.</param>
    /// <param name="format">Explicit value format; null uses the column format, except that counts use whole numbers.</param>
    public CanopyGridAggregate(string id, string column, CanopyGridAggregateOperation operation, string label, CanopyGridNumberFormat? format) {
        CanopyIdentifiers.Require(id, nameof(id)); CanopyIdentifiers.Require(column, nameof(column));
        if (!Enum.IsDefined(typeof(CanopyGridAggregateOperation), operation) || operation == CanopyGridAggregateOperation.Custom) throw new ArgumentOutOfRangeException(nameof(operation));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 512) throw new ArgumentException("An aggregate needs a label of 1 to 512 characters.", nameof(label));
        Id = id; Column = column; Operation = operation; Label = label; Format = format;
    }
    /// <summary>Creates a custom aggregate that a browser plugin (inline data) or the host source computes.</summary>
    /// <param name="id">Stable aggregate identity, independent of the column and display label.</param>
    /// <param name="column">The declared raw column identity.</param>
    /// <param name="customOperation">The operation name the plugin registers: a lowercase letter, then up to 31 letters and digits, other than the built-in names.</param>
    /// <param name="label">Plain display text, bounded to 512 characters.</param>
    public CanopyGridAggregate(string id, string column, string customOperation, string label) : this(id, column, customOperation, label, null) { }
    /// <summary>Creates a custom aggregate with an explicit display format.</summary>
    /// <param name="id">Stable aggregate identity, independent of the column and display label.</param>
    /// <param name="column">The declared raw column identity.</param>
    /// <param name="customOperation">The operation name the plugin or host computes, other than the built-in names.</param>
    /// <param name="label">Plain display text, bounded to 512 characters.</param>
    /// <param name="format">Explicit value format; null uses the column format.</param>
    public CanopyGridAggregate(string id, string column, string customOperation, string label, CanopyGridNumberFormat? format) : this(id, column, CanopyGridAggregateOperation.Count, label, format) {
        if (customOperation == null || !CustomName.IsMatch(customOperation) || Array.IndexOf(BuiltIn, customOperation) >= 0)
            throw new ArgumentException("A custom aggregate operation is a lowercase letter followed by up to 31 letters and digits, other than a built-in name.", nameof(customOperation));
        Operation = CanopyGridAggregateOperation.Custom; CustomOperation = customOperation;
    }
    private static readonly Regex CustomName = new Regex("^[a-z][a-zA-Z0-9]{0,31}$", RegexOptions.CultureInvariant);
    private static readonly string[] BuiltIn = { "count", "sum", "average", "minimum", "maximum", "distinctCount" };
    /// <summary>Gets the operation name of a <see cref="CanopyGridAggregateOperation.Custom"/> aggregate, or null.</summary>
    public string? CustomOperation { get; }
    /// <summary>Gets the stable aggregate identity.</summary>
    public string Id { get; }
    /// <summary>Gets the raw column identity.</summary>
    public string Column { get; }
    /// <summary>Gets the generic operation.</summary>
    public CanopyGridAggregateOperation Operation { get; private set; }
    /// <summary>Gets the plain display label.</summary>
    public string Label { get; }
    /// <summary>Gets the explicit value format, or null to follow the column format (whole numbers for counts).</summary>
    public CanopyGridNumberFormat? Format { get; }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("column", Column)
            .Property("operation", CustomOperation ?? OperationName(Operation)).Property("label", Label);
        if (Format != null) { writer.Name("format"); Format.WriteJson(writer); }
        writer.EndObject();
    }
    internal static string OperationName(CanopyGridAggregateOperation operation) => operation == CanopyGridAggregateOperation.Count ? "count" :
        operation == CanopyGridAggregateOperation.Sum ? "sum" : operation == CanopyGridAggregateOperation.Average ? "average" :
        operation == CanopyGridAggregateOperation.Minimum ? "minimum" : operation == CanopyGridAggregateOperation.Maximum ? "maximum" : "distinctCount";
    /// <summary>Whether the aggregate counts values (count, distinct count), so its value is a whole number within the record count.</summary>
    internal bool Counting => Operation == CanopyGridAggregateOperation.Count || Operation == CanopyGridAggregateOperation.DistinctCount;
    /// <summary>Whether the aggregate reads a number column.</summary>
    internal bool Numeric => Operation == CanopyGridAggregateOperation.Sum || Operation == CanopyGridAggregateOperation.Average ||
        Operation == CanopyGridAggregateOperation.Minimum || Operation == CanopyGridAggregateOperation.Maximum;
}
