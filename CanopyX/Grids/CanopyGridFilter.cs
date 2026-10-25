using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A typed column predicate, evaluated before sorting and paging.</summary>
/// <remarks>Operands reuse cell values. Display text and decorations are not serialized into a query.</remarks>
public sealed class CanopyGridFilter {
    /// <summary>Creates a column predicate.</summary>
    /// <param name="column">The declared column identity.</param>
    /// <param name="op">The operator.</param>
    /// <param name="values">Raw typed operands; null operators take none.</param>
    public CanopyGridFilter(string column, CanopyGridFilterOperator op, params CanopyCell[] values) {
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column;
        Operator = op;
        Values = Array.AsReadOnly((CanopyCell[])(values ?? throw new ArgumentNullException(nameof(values))).Clone());
        ValidateArity();
    }

    /// <summary>Creates a named custom filter for a browser plugin or host source.</summary>
    /// <param name="column">The declared column identity.</param>
    /// <param name="op">A safe plugin identity, other than a built-in operator.</param>
    /// <param name="values">One raw typed operand.</param>
    public CanopyGridFilter(string column, string op, params CanopyCell[] values) {
        CanopyIdentifiers.Require(column, nameof(column));
        if (op == null || !System.Text.RegularExpressions.Regex.IsMatch(op, "^[a-z][a-zA-Z0-9]{0,31}$") ||
            Array.IndexOf(new[] { "eq", "ne", "contains", "startsWith", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull", "and", "or" }, op) >= 0)
            throw new ArgumentException("A custom filter requires a safe non-built-in plugin identity.", nameof(op));
        Column = column; Operator = CanopyGridFilterOperator.Custom; CustomOperator = op;
        Values = Array.AsReadOnly((CanopyCell[])(values ?? throw new ArgumentNullException(nameof(values))).Clone());
        ValidateArity();
    }

    /// <summary>Gets the named custom operator, or null for a built-in operator.</summary>
    public string? CustomOperator { get; }

    /// <summary>Gets the declared column identity.</summary>
    public string Column { get; }

    /// <summary>Gets or sets an optional partition; operands then refer to numeric bucket keys.</summary>
    public CanopyBucket? Bucket { get; set; }

    /// <summary>Gets the operator.</summary>
    public CanopyGridFilterOperator Operator { get; }

    /// <summary>Gets the raw typed operands; cell display text and decorations do not affect them.</summary>
    public IReadOnlyList<CanopyCell> Values { get; }

    internal string WireOperator => CustomOperator ?? (Operator switch {
        CanopyGridFilterOperator.Equal => "eq",
        CanopyGridFilterOperator.NotEqual => "ne",
        CanopyGridFilterOperator.Contains => "contains",
        CanopyGridFilterOperator.StartsWith => "startsWith",
        CanopyGridFilterOperator.In => "in",
        CanopyGridFilterOperator.GreaterThan => "gt",
        CanopyGridFilterOperator.GreaterThanOrEqual => "ge",
        CanopyGridFilterOperator.LessThan => "lt",
        CanopyGridFilterOperator.LessThanOrEqual => "le",
        CanopyGridFilterOperator.IsNull => "isNull",
        CanopyGridFilterOperator.IsNotNull => "isNotNull",
        _ => throw new ArgumentOutOfRangeException(nameof(Operator), Operator, "Unknown grid filter operator.")
    });

    internal void Validate(CanopyColumn column) {
        Bucket?.Validate(column);
        if (Bucket != null) column = new CanopyColumn(column.Id, column.Title) { Kind = CanopyColumnKind.Number };
        ValidateArity();
        var textMatch = Operator == CanopyGridFilterOperator.Contains || Operator == CanopyGridFilterOperator.StartsWith;
        var comparison = Operator == CanopyGridFilterOperator.GreaterThan || Operator == CanopyGridFilterOperator.GreaterThanOrEqual
            || Operator == CanopyGridFilterOperator.LessThan || Operator == CanopyGridFilterOperator.LessThanOrEqual;
        if (textMatch && column.Kind != CanopyColumnKind.Text) throw new InvalidOperationException("Text matching requires a text column.");
        if (comparison && column.Kind == CanopyColumnKind.Text) throw new InvalidOperationException("Range filters require a numeric or date column.");
        foreach (var operand in Values) {
            var value = operand.Value;
            CanopyGridValues.Validate(value, column);
            if (textMatch && !(value is string)) throw new InvalidOperationException("A text-matching operand must be text.");
        }
    }

    private void ValidateArity() {
        _ = WireOperator;
        var nullOperator = Operator == CanopyGridFilterOperator.IsNull || Operator == CanopyGridFilterOperator.IsNotNull;
        if (nullOperator ? Values.Count != 0 : Operator == CanopyGridFilterOperator.In ? Values.Count < 1 || Values.Count > 1000 : Values.Count != 1) {
            throw new ArgumentException("Null operators take no operands, membership takes 1 to 1,000, and other operators take one.", nameof(Values));
        }
        foreach (var operand in Values) {
            if (operand == null || operand.Value == null) throw new ArgumentException("Use a null operator instead of a null operand.", nameof(Values));
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject(); WriteFields(writer); writer.EndObject();
    }

    internal void WriteFields(CanopyJsonWriter writer) {
        writer.Property("column", Column).Property("operator", WireOperator).Name("values").BeginArray();
        foreach (var operand in Values) operand.WriteValue(writer);
        writer.EndArray();
        if (Bucket != null) { writer.Name("bucket"); Bucket.WriteJson(writer); }
    }
}
