using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    private async Task PopulateFootersAsync(CanopyGridPage page, CanopyPageResult result, CanopyDataRequest query, CancellationToken token) {
        var footers = Schema.ProtocolView.Footers;
        foreach (var entry in result.FooterValues) page.FooterValues.Add(entry.Key, new Dictionary<string, double?>(entry.Value, StringComparer.Ordinal));
        CanopySummaryResult? summary = null;
        var needsSummary = footers.Any(footer => (footer.Scope == CanopyGridFooterScope.All || Schema.ProtocolView.Presentation != CanopyGridPresentation.Paged) &&
            footer.Aggregates.Any(aggregate => !page.FooterValues.TryGetValue(footer.Id, out var values) || !values.ContainsKey(aggregate.Id)));
        if (needsSummary) {
            try {
                summary = await Provider.SummarizeAsync(new CanopySummaryRequest(query.WithWindow(0, Schema.ProtocolView.PageSize)), token).ConfigureAwait(false);
                if (summary.Matched != result.Matched) throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The data changed while the footer was read; reload the grid.");
            } catch (CanopyRequestException error) when (error.Error == CanopyRequestError.Unsupported) {
                // A host can serve pages without implementing summary or custom aggregate operations.
                // Missing footer values remain unavailable rather than becoming totals over cached rows.
            }
        }
        foreach (var footer in footers) {
            if (!page.FooterValues.TryGetValue(footer.Id, out var values)) page.FooterValues.Add(footer.Id, values = new Dictionary<string, double?>(StringComparer.Ordinal));
            foreach (var aggregate in footer.Aggregates) {
                token.ThrowIfCancellationRequested();
                if (values.ContainsKey(aggregate.Id)) continue;
                if (footer.Scope == CanopyGridFooterScope.All || Schema.ProtocolView.Presentation != CanopyGridPresentation.Paged) {
                    if (summary != null && summary.Aggregates.TryGetValue(aggregate.Id, out var total)) values.Add(aggregate.Id, total);
                } else if (aggregate.Operation != CanopyGridAggregateOperation.Custom) {
                    values.Add(aggregate.Id, aggregate.Evaluate(page.Rows.Select(row => {
                        token.ThrowIfCancellationRequested();
                        return row.Cells.TryGetValue(aggregate.Column, out var cell) ? cell : null;
                    })));
                }
            }
        }
    }
}
