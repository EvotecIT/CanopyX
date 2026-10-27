using System;
using System.Collections.Generic;
using System.Threading;

namespace CanopyX;

/// <summary>Joins two complete flat-row versions by stable ordinal identity, without sorting or provider dependencies.</summary>
public static class CanopyDatasetComparer {
    /// <summary>Compares two versions in expected O(n + m) row lookups, plus the cost of inspecting their cells.</summary>
    /// <param name="before">The complete earlier dataset.</param>
    /// <param name="after">The complete later dataset.</param>
    /// <param name="columns">Optional unique cell IDs to compare; null discovers their union in first-seen source order.</param>
    /// <param name="cancellationToken">Cancels enumeration and comparison.</param>
    /// <returns>Earlier rows in source order, followed by added rows in later source order.</returns>
    /// <remarks>
    /// Each version is enumerated once and buffered. Keys are case-sensitive; duplicates in either version are rejected.
    /// Missing cells, null dictionary entries and present cells with a null value are distinct. Scalar CLR types are compared
    /// exactly (including numeric types); structured cells also compare their serialized content and nested scalar types.
    /// Display metadata on scalar cells does not change dataset facts. Record-only fields and row styling are not compared.
    /// Inputs must remain stable until the result has been presented; this method does not acquire a database snapshot.
    /// </remarks>
    /// <exception cref="ArgumentNullException">A dataset is null.</exception>
    /// <exception cref="ArgumentException">A row is null, a version has duplicate keys, or explicit columns are invalid.</exception>
    public static CanopyDatasetComparison Compare(IEnumerable<CanopyGridRow> before, IEnumerable<CanopyGridRow> after,
        IEnumerable<string>? columns = null, CancellationToken cancellationToken = default) {
        if (before == null) throw new ArgumentNullException(nameof(before));
        if (after == null) throw new ArgumentNullException(nameof(after));
        cancellationToken.ThrowIfCancellationRequested();
        var ids = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (columns != null) foreach (var id in columns) {
            cancellationToken.ThrowIfCancellationRequested();
            CanopyIdentifiers.Require(id, nameof(columns));
            if (!seen.Add(id)) throw new ArgumentException("Comparison column IDs must be unique.", nameof(columns));
            ids.Add(id);
        }
        var left = Index(before, nameof(before), columns == null ? ids : null, seen, cancellationToken);
        var right = Index(after, nameof(after), columns == null ? ids : null, seen, cancellationToken);
        var changes = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var id in ids) changes.Add(id, 0);
        var rows = new List<CanopyComparedRow>();
        var added = 0; var removed = 0; var changed = 0; var unchanged = 0;
        foreach (var oldRow in left.Order) {
            cancellationToken.ThrowIfCancellationRequested();
            var different = new List<string>();
            if (!right.ById.TryGetValue(oldRow.Id, out var newRow)) {
                removed++;
                rows.Add(new CanopyComparedRow(oldRow, null, CanopyDatasetRowStatus.Removed, different));
                continue;
            }
            foreach (var id in ids) {
                cancellationToken.ThrowIfCancellationRequested();
                var had = oldRow.Cells.TryGetValue(id, out var oldCell);
                var has = newRow.Cells.TryGetValue(id, out var newCell);
                if (had == has && CanopyCompareCells.Equal(oldCell, newCell)) continue;
                different.Add(id); changes[id]++;
            }
            var status = different.Count == 0 ? CanopyDatasetRowStatus.Unchanged : CanopyDatasetRowStatus.Changed;
            if (different.Count == 0) unchanged++; else changed++;
            rows.Add(new CanopyComparedRow(oldRow, newRow, status, different));
        }
        foreach (var newRow in right.Order) {
            cancellationToken.ThrowIfCancellationRequested();
            if (left.ById.ContainsKey(newRow.Id)) continue;
            added++;
            rows.Add(new CanopyComparedRow(null, newRow, CanopyDatasetRowStatus.Added, new List<string>()));
        }
        var statusColumn = "change";
        for (var suffix = 1; seen.Contains(statusColumn); suffix++) statusColumn = "change_" + suffix.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return new CanopyDatasetComparison(rows, ids, statusColumn,
            new CanopyDatasetCompareCounts(added, removed, changed, unchanged), changes);
    }

    private static (List<CanopyGridRow> Order, Dictionary<string, CanopyGridRow> ById) Index(IEnumerable<CanopyGridRow> source,
        string parameter, List<string>? columns, HashSet<string> seen, CancellationToken token) {
        var order = new List<CanopyGridRow>();
        var byId = new Dictionary<string, CanopyGridRow>(StringComparer.Ordinal);
        foreach (var row in source) {
            token.ThrowIfCancellationRequested();
            if (row == null) throw new ArgumentException("A dataset cannot contain a null row.", parameter);
            if (byId.ContainsKey(row.Id)) throw new ArgumentException("Duplicate row key '" + row.Id + "' in " + parameter + ".", parameter);
            byId.Add(row.Id, row); order.Add(row);
            // Reserve every source key even when only a subset is compared.
            foreach (var id in row.Cells.Keys) if (seen.Add(id)) columns?.Add(id);
        }
        return (order, byId);
    }
}
