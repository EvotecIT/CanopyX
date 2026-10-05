using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A bounded group of typed predicates and nested groups, applied before sorting and paging.</summary>
/// <remarks>
/// A query supports eight group levels, 64 groups and 64 predicates in total, including its flat predicates.
/// Every group contains at least one predicate or child group. Hosts apply the same limits and semantics.
/// </remarks>
public sealed class CanopyGridFilterGroup {
    /// <summary>Creates a group with optional initial predicates.</summary>
    /// <param name="junction">Whether all or any children must match.</param>
    /// <param name="filters">Initial typed predicates. Nested groups can be added to <see cref="Groups"/>.</param>
    public CanopyGridFilterGroup(CanopyGridFilterJunction junction, params CanopyGridFilter[] filters) {
        Junction = junction;
        _ = WireJunction;
        if (filters == null) throw new ArgumentNullException(nameof(filters));
        foreach (var filter in filters) Filters.Add(filter ?? throw new ArgumentException("Predicates cannot be null.", nameof(filters)));
    }

    /// <summary>Gets whether all or any predicates and child groups must match.</summary>
    public CanopyGridFilterJunction Junction { get; }

    /// <summary>Gets the typed predicates that participate in this group.</summary>
    public IList<CanopyGridFilter> Filters { get; } = new List<CanopyGridFilter>();

    /// <summary>Gets the nested groups that participate in this group.</summary>
    public IList<CanopyGridFilterGroup> Groups { get; } = new List<CanopyGridFilterGroup>();

    private string WireJunction => Junction switch {
        CanopyGridFilterJunction.All => "and",
        CanopyGridFilterJunction.Any => "or",
        _ => throw new ArgumentOutOfRangeException(nameof(Junction), Junction, "Unknown filter junction.")
    };

    internal void Validate(IDictionary<string, CanopyColumn> columns, int depth, ref int predicates, ref int groups) {
        if (depth > 8 || ++groups > 64) throw new InvalidOperationException("A grid query supports eight group levels and at most 64 groups.");
        if (Filters.Count == 0 && Groups.Count == 0) throw new InvalidOperationException("A grid filter group cannot be empty.");
        foreach (var filter in Filters) {
            if (++predicates > 64) throw new InvalidOperationException("A grid query supports at most 64 predicates across all groups.");
            if (filter == null || !columns.TryGetValue(filter.Column, out var column)) throw new InvalidOperationException("Grid predicates must identify declared columns.");
            filter.Validate(column);
        }
        foreach (var group in Groups) {
            if (group == null) throw new InvalidOperationException("A grid filter group cannot contain a null group.");
            group.Validate(columns, depth + 1, ref predicates, ref groups);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("operator", WireJunction).Name("filters").BeginArray();
        foreach (var filter in Filters) filter.WriteJson(writer);
        writer.EndArray().Name("groups").BeginArray();
        foreach (var group in Groups) group.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
