using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// Checks the protocol rules that span a whole view: unique column and filter ids, known columns and icons, leaf
/// detail rows, and nodes an inline view can actually show.
/// </summary>
internal static class CanopyViewValidator {
    /// <param name="view">The view.</param>
    /// <param name="requireCompleteTree">
    /// True when every child must be in the tree even though the source is not inline, as for the bundle writer.
    /// </param>
    internal static void Validate(CanopyView view, bool requireCompleteTree = false) {
        if (view.Columns.Count == 0) {
            throw new InvalidOperationException("View '" + view.Id + "' needs at least one column.");
        }

        var columns = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in view.Columns) {
            if (column == null) {
                throw new InvalidOperationException("View '" + view.Id + "' has a null column.");
            }

            if (!columns.Add(column.Id)) {
                throw new InvalidOperationException("View '" + view.Id + "' has more than one column with id '" + column.Id + "'.");
            }
        }

        if (view.Columns[0].Hidden) {
            throw new InvalidOperationException("The tree column '" + view.Columns[0].Id + "' of view '" + view.Id + "' cannot be hidden.");
        }

        foreach (var icon in view.Icons) {
            if (string.IsNullOrEmpty(icon.Key) || icon.Value == null || !icon.Value.TrimStart().StartsWith("<svg", StringComparison.OrdinalIgnoreCase)) {
                throw new InvalidOperationException("Icon '" + icon.Key + "' of view '" + view.Id + "' must be SVG markup that starts with <svg.");
            }
        }

        var filters = new HashSet<string>(StringComparer.Ordinal);
        foreach (var filter in view.Filters) {
            if (filter == null || !filters.Add(filter.Id)) {
                throw new InvalidOperationException("View '" + view.Id + "' has a null or duplicate filter.");
            }
        }

        if (view.Search != null && view.Source.Kind == CanopySourceKind.Sidecar && view.Search.MinLength < 2) {
            throw new InvalidOperationException("View '" + view.Id + "' uses a sidecar source, whose search shards need queries of at least 2 characters.");
        }

        var inline = requireCompleteTree || view.Source.Kind == CanopySourceKind.Inline;
        CanopyTreeValidator.Validate(view.Roots, "View '" + view.Id + "'", node => ValidateNode(view, columns, inline, node));
    }

    private static void ValidateNode(CanopyView view, HashSet<string> columns, bool inline, CanopyNode node) {
        if (node.Icon != null && !view.Icons.ContainsKey(node.Icon)) {
            throw new InvalidOperationException("Node '" + node.Id + "' uses icon '" + node.Icon + "', which view '" + view.Id + "' does not declare.");
        }

        foreach (var cell in node.CellEntries) {
            if (!columns.Contains(cell.Key)) {
                throw new InvalidOperationException("Node '" + node.Id + "' has a cell for column '" + cell.Key + "', which view '" + view.Id + "' does not have.");
            }
        }

        // An inline view has nowhere to load children from, so every child must already be in the tree.
        if (inline && ((node.HasChildren && !node.HasInlineChildren) || node.Ref != null)) {
            throw new InvalidOperationException("Node '" + node.Id + "' declares children that load later, but view '" + view.Id + "' needs the complete tree (an inline source or a bundle); add the children or use a remote source.");
        }
    }
}
