using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Checks identity and cell invariants shared by inline datasets and host result pages.</summary>
internal static class CanopyGridRows {
    internal static void Validate(IEnumerable<CanopyGridRow> rows, ISet<string>? columnIds = null, IEnumerable<CanopyColumn>? columns = null, CanopyGridDetail? detail = null) {
        var identities = new HashSet<string>(StringComparer.Ordinal);
        Dictionary<string, CanopyColumn>? bindings = null;
        if (columns != null) {
            bindings = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
            foreach (var column in columns) bindings.Add(column.Id, column);
        }
        var nestedGrid = detail?.View;
        var nestedGridColumns = nestedGrid == null ? null : CanopyGridRecord.ColumnIds(nestedGrid.Columns);
        var nestedTree = detail?.TreeView;
        var nestedTreeColumns = nestedTree == null ? null : CanopyGridRecord.ColumnIds(nestedTree.Columns);
        foreach (var row in rows) {
            if (row == null || !identities.Add(row.Id)) throw new InvalidOperationException("Grid rows must have unique stable identities and cannot be null.");
            row.Validate(columnIds, bindings);
            if (row.Detail is CanopyGridRowsDetail nested && nestedGrid != null) {
                Validate(nested.Rows, nestedGridColumns, nestedGrid.Columns, nestedGrid.Reporting?.Detail);
            }
            if (row.Detail is CanopyTreeDetail tree) {
                CanopyTreeValidator.Validate(tree.Roots, "A nested detail tree", node => {
                    if (node.HasChildren && !node.HasInlineChildren || node.Ref != null)
                        throw new InvalidOperationException("A nested detail tree must carry its complete inline children.");
                    if (nestedTree != null) CanopyTreeViewValidator.ValidateNodeAgainstView(nestedTree, nestedTreeColumns!, node);
                });
            }
        }
    }
}
