using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>Complete-query aggregates and, for a grouped request, every group of the first level with its count and
/// aggregates, with the groups of each further level nested inside their outer group.</summary>
/// <remarks>Groups may come in any order at every level; the endpoint orders them by each level's order and assigns their ranges.</remarks>
public sealed class CanopySummaryResult {
    /// <summary>Creates a summary.</summary>
    /// <param name="matched">Records matching the query.</param>
    /// <param name="aggregates">Complete-query values keyed by declared aggregate identity.</param>
    /// <param name="groups">Every group of the first level of a grouped request; empty when the request has no grouping levels.</param>
    public CanopySummaryResult(int matched, IReadOnlyDictionary<string, double?> aggregates, IEnumerable<CanopySummaryGroup> groups) {
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        Matched = matched;
        Aggregates = aggregates ?? throw new ArgumentNullException(nameof(aggregates));
        Groups = new ReadOnlyCollection<CanopySummaryGroup>(new List<CanopySummaryGroup>(groups ?? throw new ArgumentNullException(nameof(groups))));
    }

    /// <summary>Gets the matching record count.</summary>
    public int Matched { get; }

    /// <summary>Gets the complete-query aggregate values.</summary>
    public IReadOnlyDictionary<string, double?> Aggregates { get; }

    /// <summary>Gets the groups of the first level; inner levels nest in <see cref="CanopySummaryGroup.Groups"/>.</summary>
    public IReadOnlyList<CanopySummaryGroup> Groups { get; }
}
