using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyGridPage {
    /// <summary>Gets accepted footer values by footer row identity, then aggregate identity. Missing values are unavailable; null is an accepted empty result.</summary>
    public IDictionary<string, IDictionary<string, double?>> FooterValues { get; } = new Dictionary<string, IDictionary<string, double?>>(StringComparer.Ordinal);

    internal void WriteFooterValues(CanopyJsonWriter writer, CanopyDataGridView? view) {
        if (FooterValues.Count == 0) return;
        writer.Name("footerValues").BeginObject();
        foreach (var row in FooterValues) {
            CanopyIdentifiers.Require(row.Key, nameof(FooterValues));
            var footer = view?.Footers.FirstOrDefault(item => item.Id == row.Key);
            if (row.Value == null || view != null && footer == null) throw new InvalidOperationException("Footer values require declared footer rows.");
            writer.Name(row.Key).BeginObject();
            foreach (var entry in row.Value) {
                CanopyIdentifiers.Require(entry.Key, nameof(FooterValues));
                var aggregate = footer?.Aggregates.FirstOrDefault(item => item.Id == entry.Key);
                var count = footer?.Scope == CanopyGridFooterScope.Page && view?.Presentation == CanopyGridPresentation.Paged ? Rows.Count : Matched;
                if (footer != null && aggregate == null || entry.Value.HasValue && (double.IsNaN(entry.Value.Value) || double.IsInfinity(entry.Value.Value) || Math.Abs(entry.Value.Value) > 9007199254740991d))
                    throw new InvalidOperationException("Footer values require declared finite safe numbers or null.");
                if (aggregate?.Counting == true && (!entry.Value.HasValue || entry.Value < 0 || entry.Value > count || entry.Value != Math.Floor(entry.Value.Value)))
                    throw new InvalidOperationException("Footer counts must be whole nonmissing counts within the accepted scope.");
                if (count == 0 && aggregate != null && !aggregate.Counting && entry.Value.HasValue) throw new InvalidOperationException("An empty footer scope has no aggregate value except counts.");
                writer.Name(entry.Key); if (entry.Value.HasValue) writer.Number(entry.Value.Value); else writer.Null();
            }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
