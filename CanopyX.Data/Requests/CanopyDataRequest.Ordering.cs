using System;
using System.Collections.Generic;

namespace CanopyX.Data;

public sealed partial class CanopyDataRequest {
    /// <summary>Built-in providers consume raw keys; the public request keeps aliases and their host comparator intent.</summary>
    internal IReadOnlyList<CanopySortKey> ProviderSort(bool insideGroups = false) {
        var result = new List<CanopySortKey>();
        var used = new HashSet<string>(StringComparer.Ordinal);
        var rawPriority = new HashSet<string>(StringComparer.Ordinal);
        var grouped = new HashSet<string>(StringComparer.Ordinal);
        void RequireBuiltIn(CanopyDataColumn column) {
            if (column.Definition.SortComparator != null)
                throw new CanopyRequestException(CanopyRequestError.Unsupported, "A named sort comparator requires a host provider that implements it.");
        }
        void Add(CanopyDataColumn column, bool descending) {
            if (used.Add(column.Id) && (!insideGroups || !grouped.Contains(column.Id))) result.Add(new CanopySortKey(column, descending));
        }
        foreach (var level in Levels) { grouped.Add(level.Column.Id); rawPriority.Add(level.Column.Id); RequireBuiltIn(level.Column); Add(level.Column, level.Aggregate == null && level.Descending); }
        foreach (var key in Schema.ProtocolView.PreSort) {
            var column = Schema.GetColumn(key.Column); RequireBuiltIn(column); rawPriority.Add(column.Id); Add(column, key.Descending);
        }
        foreach (var key in Sort) {
            RequireBuiltIn(key.Column);
            if (rawPriority.Contains(key.Column.Id)) continue;
            var targets = key.Column.Definition.OrderData;
            if (targets.Count == 0) Add(key.Column, key.Descending);
            else foreach (var id in targets) Add(Schema.GetColumn(id), key.Descending);
        }
        return result;
    }
}
