using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>A validated complete-query summary request: the declared aggregates over the query, and per group of each grouping level.</summary>
public sealed class CanopySummaryRequest {
    /// <summary>Creates a summary request from the query's grouping levels and the schema's aggregates.</summary>
    /// <param name="query">The complete query; its window does not apply.</param>
    public CanopySummaryRequest(CanopyDataRequest query) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        Aggregates = query.Schema.SummaryAggregates;
    }

    /// <summary>Gets the complete query.</summary>
    public CanopyDataRequest Query { get; }

    /// <summary>Gets the grouping levels, outermost first: the fixed grouping, the query's <c>groupBy</c>, or none for an ungrouped summary.</summary>
    /// <remarks>The provider returns the groups of the first level, each with the groups of the next level nested in
    /// <see cref="CanopySummaryGroup.Groups"/>; groups of the innermost level have none.</remarks>
    public IReadOnlyList<CanopySummaryLevel> Levels => Query.Levels;

    /// <summary>Gets the declared aggregates.</summary>
    public IReadOnlyList<CanopySummaryAggregate> Aggregates { get; }
}
