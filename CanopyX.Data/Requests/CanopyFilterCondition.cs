using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated predicate on one allowed column with typed operands.</summary>
/// <remarks>
/// Operands are converted from the wire before a provider sees them: text columns receive <see cref="string"/> or
/// <see cref="bool"/>, number columns <see cref="double"/>, and date columns UTC <see cref="DateTime"/> values truncated to
/// milliseconds. Text equality and matching are case-insensitive; a null value fails every operator except
/// <see cref="CanopyGridFilterOperator.IsNull"/>, including <see cref="CanopyGridFilterOperator.NotEqual"/>.
/// </remarks>
public sealed class CanopyFilterCondition : CanopyFilterNode {
    /// <summary>Creates a condition. Values must already have the column's typed shape.</summary>
    /// <param name="column">The allowed column.</param>
    /// <param name="op">The operator.</param>
    /// <param name="values">The typed operands.</param>
    public CanopyFilterCondition(CanopyDataColumn column, CanopyGridFilterOperator op, IEnumerable<object> values) {
        Column = column ?? throw new ArgumentNullException(nameof(column));
        Operator = op;
        var list = new List<object>();
        foreach (var value in values ?? throw new ArgumentNullException(nameof(values))) list.Add(value ?? throw new ArgumentException("Operands cannot be null.", nameof(values)));
        Values = new ReadOnlyCollection<object>(list);
    }

    /// <inheritdoc />
    public override CanopyFilterNodeKind Kind => CanopyFilterNodeKind.Condition;

    /// <summary>Gets the column.</summary>
    public CanopyDataColumn Column { get; }

    /// <summary>Gets the operator.</summary>
    public CanopyGridFilterOperator Operator { get; }

    /// <summary>Gets the typed operands: none for null tests, one to 1,000 for membership, one otherwise.</summary>
    public IReadOnlyList<object> Values { get; }
}
