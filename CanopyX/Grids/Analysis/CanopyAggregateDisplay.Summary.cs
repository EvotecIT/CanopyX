using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace CanopyX;

public static partial class CanopyAggregateDisplay {
    internal static string Caption(CanopyShowAs mode, CanopyLabels labels) => mode switch {
        CanopyShowAs.PercentGrandTotal => labels.GridShowAsPercentGrandTotal,
        CanopyShowAs.PercentParent => labels.GridShowAsPercentParent,
        CanopyShowAs.PercentColumn => labels.GridShowAsPercentColumn,
        CanopyShowAs.PercentRow => labels.GridShowAsPercentRow,
        CanopyShowAs.RunningTotal => labels.GridShowAsRunningTotal,
        CanopyShowAs.Rank => labels.GridShowAsRank,
        CanopyShowAs.Difference => labels.GridShowAsDifference,
        CanopyShowAs.PercentChange => labels.GridShowAsPercentChange,
        _ => string.Empty
    };
    /// <summary>Derives display values for a validated accepted summary, in sibling order, without altering raw aggregates.</summary>
    /// <param name="view">The owning reporting view.</param>
    /// <param name="summary">The accepted full-query summary.</param>
    /// <param name="modes">Optional per-aggregate reader choices; omitted identities use their descriptor's mode.</param>
    /// <returns>Numeric transformed values and export number formats for the totals and every group.</returns>
    public static CanopyGridSummaryDisplay FromSummary(CanopyDataGridView view, CanopyGridSummary summary, IReadOnlyDictionary<string, CanopyShowAs>? modes = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (summary == null) throw new ArgumentNullException(nameof(summary));
        _ = summary.ToJson(view);
        var aggregates = view.Reporting!.Aggregates;
        if (modes != null && modes.Keys.Any(id => !aggregates.Any(aggregate => aggregate.Id == id))) throw new ArgumentException("Display modes must name declared aggregates.", nameof(modes));
        CanopyShowAs Mode(CanopyGridAggregate aggregate) => modes != null && modes.TryGetValue(aggregate.Id, out var mode) ? mode : aggregate.ShowAs;
        var totals = new Dictionary<string, CanopyAggregateDisplayValue>(StringComparer.Ordinal);
        var groups = new Dictionary<string, IReadOnlyDictionary<string, CanopyAggregateDisplayValue>>(StringComparer.Ordinal);
        foreach (var aggregate in aggregates) {
            var raw = summary.Aggregates[aggregate.Id]; var mode = Mode(aggregate);
            totals[aggregate.Id] = new CanopyAggregateDisplayValue(Evaluate(new[] { raw }, mode, raw, raw)[0], mode);
        }
        void Walk(IList<CanopyGridGroup> siblings, IDictionary<string, double?> parent) {
            var rows = siblings.Select(_ => new Dictionary<string, CanopyAggregateDisplayValue>(StringComparer.Ordinal)).ToArray();
            foreach (var aggregate in aggregates) {
                var mode = Mode(aggregate);
                var values = Evaluate(siblings.Select(group => group.Aggregates[aggregate.Id]).ToArray(), mode, summary.Aggregates[aggregate.Id], parent[aggregate.Id]);
                for (var i = 0; i < siblings.Count; i++) rows[i][aggregate.Id] = new CanopyAggregateDisplayValue(values[i], mode);
            }
            for (var i = 0; i < siblings.Count; i++) {
                groups.Add(siblings[i].Key, new ReadOnlyDictionary<string, CanopyAggregateDisplayValue>(rows[i]));
                Walk(siblings[i].Groups, siblings[i].Aggregates);
            }
        }
        Walk(summary.Groups, summary.Aggregates);
        return new CanopyGridSummaryDisplay(totals, groups);
    }
}
