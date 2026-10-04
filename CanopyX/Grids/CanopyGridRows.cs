using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Checks identity and cell invariants shared by inline datasets and host result pages.</summary>
internal static class CanopyGridRows {
    internal static void Validate(IEnumerable<CanopyGridRow> rows, ISet<string>? columnIds = null, IEnumerable<CanopyColumn>? columns = null) {
        var identities = new HashSet<string>(StringComparer.Ordinal);
        Dictionary<string, CanopyColumn>? bindings = null;
        if (columns != null) {
            bindings = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
            foreach (var column in columns) bindings.Add(column.Id, column);
        }
        foreach (var row in rows) {
            if (row == null || !identities.Add(row.Id)) throw new InvalidOperationException("Grid rows must have unique stable identities and cannot be null.");
            row.Validate(columnIds, bindings);
        }
    }
}
