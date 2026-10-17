using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// When a formatting rule applies: a group of predicates and nested groups that combine with all, any or none. It is the
/// flat-grid filter group with a third junction, so every filter group is a condition (<see cref="FromFilterGroup"/>).
/// </summary>
/// <remarks>A rule's condition supports eight levels, 64 groups and 64 predicates, as a query does. Every group holds at least one predicate or group.</remarks>
public sealed class CanopyFormatCondition {
    /// <summary>Creates a condition group.</summary>
    /// <param name="junction">How its predicates and groups combine.</param>
    /// <param name="predicates">Initial predicates; nested groups go into <see cref="Groups"/>.</param>
    public CanopyFormatCondition(CanopyFormatJunction junction, params CanopyFormatPredicate[] predicates) {
        Junction = junction;
        _ = CanopyFormatNames.Wire(junction);
        if (predicates == null) throw new ArgumentNullException(nameof(predicates));
        foreach (var predicate in predicates) Predicates.Add(predicate ?? throw new ArgumentException("Predicates cannot be null.", nameof(predicates)));
    }

    /// <summary>Gets how the predicates and groups combine.</summary>
    public CanopyFormatJunction Junction { get; }

    /// <summary>Gets the predicates of this group.</summary>
    public IList<CanopyFormatPredicate> Predicates { get; } = new List<CanopyFormatPredicate>();

    /// <summary>Gets the nested groups of this group.</summary>
    public IList<CanopyFormatCondition> Groups { get; } = new List<CanopyFormatCondition>();

    /// <summary>Returns a group in which every predicate must match.</summary>
    /// <param name="predicates">The predicates.</param>
    /// <returns>The condition.</returns>
    public static CanopyFormatCondition All(params CanopyFormatPredicate[] predicates) => new CanopyFormatCondition(CanopyFormatJunction.All, predicates);

    /// <summary>Returns a group in which at least one predicate must match.</summary>
    /// <param name="predicates">The predicates.</param>
    /// <returns>The condition.</returns>
    public static CanopyFormatCondition Any(params CanopyFormatPredicate[] predicates) => new CanopyFormatCondition(CanopyFormatJunction.Any, predicates);

    /// <summary>Returns a group in which no predicate may match.</summary>
    /// <param name="predicates">The predicates.</param>
    /// <returns>The condition.</returns>
    public static CanopyFormatCondition None(params CanopyFormatPredicate[] predicates) => new CanopyFormatCondition(CanopyFormatJunction.None, predicates);

    /// <summary>Returns a single-predicate condition.</summary>
    /// <param name="column">The column read.</param>
    /// <param name="op">The operator.</param>
    /// <param name="values">The operands.</param>
    /// <returns>A condition that matches when the predicate does.</returns>
    public static CanopyFormatCondition Where(string column, CanopyFormatOperator op, params CanopyCell[] values) => All(new CanopyFormatPredicate(column, op, values));

    /// <summary>Returns the condition of a flat-grid filter group, with the same predicates, nesting and junctions.</summary>
    /// <param name="group">The filter group.</param>
    /// <returns>The equivalent condition.</returns>
    public static CanopyFormatCondition FromFilterGroup(CanopyGridFilterGroup group) {
        if (group == null) throw new ArgumentNullException(nameof(group));
        var condition = new CanopyFormatCondition(group.Junction == CanopyGridFilterJunction.Any ? CanopyFormatJunction.Any : CanopyFormatJunction.All);
        foreach (var filter in group.Filters) condition.Predicates.Add(CanopyFormatPredicate.FromFilter(filter));
        foreach (var child in group.Groups) condition.Groups.Add(FromFilterGroup(child));
        return condition;
    }

    internal void Validate(IDictionary<string, CanopyColumn> columns, int depth, ref int predicates, ref int groups) {
        if (depth > 8 || ++groups > 64) throw new InvalidOperationException("A formatting condition supports eight levels and at most 64 groups.");
        if (Predicates.Count == 0 && Groups.Count == 0) throw new InvalidOperationException("A formatting condition group cannot be empty.");
        _ = CanopyFormatNames.Wire(Junction);
        foreach (var predicate in Predicates) {
            if (predicate == null) throw new InvalidOperationException("A formatting condition cannot contain a null predicate.");
            if (++predicates > 64) throw new InvalidOperationException("A formatting rule supports at most 64 conditions.");
            predicate.Validate(columns);
        }
        foreach (var group in Groups) {
            if (group == null) throw new InvalidOperationException("A formatting condition cannot contain a null group.");
            group.Validate(columns, depth + 1, ref predicates, ref groups);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("operator", CanopyFormatNames.Wire(Junction)).Name("filters").BeginArray();
        foreach (var predicate in Predicates) predicate.WriteJson(writer);
        writer.EndArray().Name("groups").BeginArray();
        foreach (var group in Groups) group.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
