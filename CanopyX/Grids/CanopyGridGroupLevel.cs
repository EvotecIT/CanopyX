using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One level of runtime row grouping: a declared sortable column and the order of its groups.</summary>
/// <remarks>
/// Levels are ordered, outermost first, at most four. Groups of a level order by their raw value, or by the value of a declared
/// aggregate (missing aggregate values last, equal values by group value). The level's column leads the record sort, so the
/// records of a group stay together; the user's sorts apply inside the innermost groups.
/// </remarks>
public sealed class CanopyGridGroupLevel {
    /// <summary>Creates a grouping level.</summary>
    /// <param name="column">The declared sortable column whose raw values form the groups. Missing values form one last group.</param>
    /// <param name="descending">Whether groups follow descending order.</param>
    /// <param name="aggregate">An optional declared aggregate identity whose value orders the groups instead of their value.</param>
    public CanopyGridGroupLevel(string column, bool descending = false, string? aggregate = null) {
        CanopyIdentifiers.Require(column, nameof(column));
        if (aggregate != null) CanopyIdentifiers.Require(aggregate, nameof(aggregate));
        Column = column; Descending = descending; Aggregate = aggregate;
    }

    /// <summary>Gets the grouping column.</summary>
    public string Column { get; }

    /// <summary>Gets whether groups follow descending order.</summary>
    public bool Descending { get; }

    /// <summary>Gets the declared aggregate whose value orders the groups, or null to order them by value.</summary>
    public string? Aggregate { get; }

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("column", Column)
        .Property("direction", Descending ? "desc" : "asc").OptionalProperty("aggregate", Aggregate).EndObject();
}
