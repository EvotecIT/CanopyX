using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated complete-query summary request: declared aggregates, optionally per group of one column.</summary>
public sealed class CanopySummaryRequest {
    /// <summary>Creates a summary request from the schema's grouping and aggregates.</summary>
    /// <param name="query">The complete query; its window does not apply.</param>
    public CanopySummaryRequest(CanopyDataRequest query) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        var schema = query.Schema;
        if (schema.Grouping != null) {
            GroupColumn = schema.GetColumn(schema.Grouping.Column);
            GroupDescending = schema.Grouping.Descending;
        }
        var list = new List<CanopySummaryAggregate>();
        foreach (var aggregate in schema.Aggregates) list.Add(new CanopySummaryAggregate(aggregate.Id, schema.GetColumn(aggregate.Column), aggregate.Operation));
        Aggregates = new ReadOnlyCollection<CanopySummaryAggregate>(list);
    }

    /// <summary>Gets the complete query.</summary>
    public CanopyDataRequest Query { get; }

    /// <summary>Gets the grouping column, or null for an ungrouped summary.</summary>
    public CanopyDataColumn? GroupColumn { get; }

    /// <summary>Gets whether groups are ordered descending. Null values always form the last group.</summary>
    public bool GroupDescending { get; }

    /// <summary>Gets the declared aggregates.</summary>
    public IReadOnlyList<CanopySummaryAggregate> Aggregates { get; }
}
