using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Checks identity and cell invariants shared by inline datasets and host result pages.</summary>
internal static class CanopyGridRows {
    internal static void Validate(IEnumerable<CanopyGridRow> rows, ISet<string>? columnIds = null, IEnumerable<CanopyColumn>? columns = null, CanopyGridDetail? detail = null, int structureDepth = 0) {
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
            // This walk owns details, with definition metadata when supplied; avoid a second generic subtree walk.
            row.Validate(columnIds, bindings, structureDepth, validateDetail: false);
            if (row.Detail != null && structureDepth > CanopyCell.MaxStructureDepth)
                throw new InvalidOperationException("Structured values nest at most " + CanopyCell.MaxStructureDepth + " levels.");
            if (row.Detail is CanopyGridRowsDetail nested) {
                Validate(nested.Rows, nestedGridColumns, nestedGrid?.Columns, nestedGrid?.Reporting?.Detail, structureDepth + 1);
            } else if (row.Detail is CanopyTreeDetail tree) {
                CanopyTreeValidator.Validate(tree.Roots, "A nested detail tree", node => {
                    if (node.HasChildren && !node.HasInlineChildren || node.Ref != null)
                        throw new InvalidOperationException("A nested detail tree must carry its complete inline children.");
                    if (nestedTree != null) CanopyTreeViewValidator.ValidateNodeAgainstView(nestedTree, nestedTreeColumns!, node);
                }, structureDepth: structureDepth + 1);
            } else {
                row.Detail?.ValidateStructure(structureDepth);
            }
        }
    }
}
