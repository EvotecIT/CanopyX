using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX;

/// <summary>Transformed full-query and group aggregates derived from one accepted summary without changing it.</summary>
public sealed class CanopyGridSummaryDisplay {
    internal CanopyGridSummaryDisplay(Dictionary<string, CanopyAggregateDisplayValue> totals, Dictionary<string, IReadOnlyDictionary<string, CanopyAggregateDisplayValue>> groups) {
        Totals = new ReadOnlyDictionary<string, CanopyAggregateDisplayValue>(totals);
        Groups = new ReadOnlyDictionary<string, IReadOnlyDictionary<string, CanopyAggregateDisplayValue>>(groups);
    }
    /// <summary>Gets complete-query values keyed by aggregate identity.</summary>
    public IReadOnlyDictionary<string, CanopyAggregateDisplayValue> Totals { get; }
    /// <summary>Gets transformed group values keyed by stable group key, then aggregate identity.</summary>
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, CanopyAggregateDisplayValue>> Groups { get; }
}
