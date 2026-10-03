using System;
using System.Collections.Generic;
using CanopyX.Json;

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
        var columns = ValidateDefinition(view, requireCompleteTree);
        var inline = view.Source.Kind == CanopySourceKind.Inline;
        // Sidecar views keep the original in-memory roots after bundling, but serialize only a manifest reference.
        var replacingInlineRefs = requireCompleteTree || view.Source.Kind == CanopySourceKind.Sidecar;
        CanopyTreeValidator.Validate(view.Roots, "View '" + view.Id + "'", node => ValidateNode(view, columns, inline, requireCompleteTree, node), replacingInlineRefs: replacingInlineRefs);
    }

    /// <summary>Checks everything about a view except its nodes, and returns the column ids for the node checks.</summary>
    /// <param name="view">The view.</param>
    /// <param name="bundle">True when the view is written as a bundle, which brings its own search index.</param>
    internal static HashSet<string> ValidateDefinition(CanopyView view, bool bundle) {
        // Bundle writers use this validation before creating sidecars, not only when serializing the page.
        CanopyJsonNames.Selection(view.Selection);
        CanopyCheckIntentValidator.Validate(view);
        var actions = new HashSet<string>(StringComparer.Ordinal);
        foreach (var action in view.ContextActions) {
            if (action == null || !actions.Add(action.Id)) throw new InvalidOperationException("Context actions must have unique identifiers and cannot be null.");
        }
        CanopyJsonNames.TimeZone(view.TimeZone);
        if (view.Columns.Count == 0) {
            throw new InvalidOperationException("View '" + view.Id + "' needs at least one column.");
        }

        var columns = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in view.Columns) {
            if (column == null) {
                throw new InvalidOperationException("View '" + view.Id + "' has a null column.");
            }

            // Bundle writers validate before creating any sidecar output.
            CanopyJsonNames.ColumnKind(column.Kind);

            if (!columns.Add(column.Id)) {
                throw new InvalidOperationException("View '" + view.Id + "' has more than one column with id '" + column.Id + "'.");
            }
        }

        if (view.Columns[0].Hidden) {
            throw new InvalidOperationException("The tree column '" + view.Columns[0].Id + "' of view '" + view.Id + "' cannot be hidden.");
        }

        foreach (var icon in view.Icons) {
            var markup = icon.Value?.TrimStart();
            if (string.IsNullOrEmpty(icon.Key) || markup == null || markup.Length <= 4 || !markup.StartsWith("<svg", StringComparison.OrdinalIgnoreCase)
                || " \t\r\n\f/>".IndexOf(markup[4]) < 0) {
                throw new InvalidOperationException("Icon '" + icon.Key + "' of view '" + view.Id + "' must be SVG markup that starts with <svg.");
            }
        }

        var filters = new HashSet<string>(StringComparer.Ordinal);
        foreach (var filter in view.Filters) {
            if (filter == null || !filters.Add(filter.Id)) {
                throw new InvalidOperationException("View '" + view.Id + "' has a null or duplicate filter.");
            }
        }

        foreach (var kind in view.Search?.Kinds ?? (IEnumerable<string>)Array.Empty<string>()) {
            if (string.IsNullOrEmpty(kind)) {
                throw new InvalidOperationException("View '" + view.Id + "' has a null or empty search kind.");
            }
        }

        if (view.Search != null && view.Source.Kind == CanopySourceKind.Sidecar && view.Search.MinLength < 2) {
            throw new InvalidOperationException("View '" + view.Id + "' uses a sidecar source, whose search shards need queries of at least 2 characters.");
        }

        if (!bundle && view.Search != null && view.Source.Kind == CanopySourceKind.Remote && view.Source.SearchUrl == null) {
            throw new InvalidOperationException("Remote search options require a search endpoint.");
        }

        return columns;
    }

    private static void ValidateNode(CanopyView view, HashSet<string> columns, bool inline, bool complete, CanopyNode node) {
        ValidateNodeAgainstView(view, columns, node);
        // An inline view has nowhere to load children from, so every child must already be in the tree.
        if (((inline || complete) && node.HasChildren && !node.HasInlineChildren) || (inline && !complete && node.Ref != null)) {
            throw new InvalidOperationException("Node '" + node.Id + "' declares children that load later, but view '" + view.Id + "' needs the complete tree (an inline source or a bundle); add the children or use a remote source.");
        }
    }

    /// <summary>Checks that a node uses only icons and columns the view declares.</summary>
    internal static void ValidateNodeAgainstView(CanopyView view, HashSet<string> columns, CanopyNode node) {
        if (node.Icon != null && !view.Icons.ContainsKey(node.Icon)) {
            throw new InvalidOperationException("Node '" + node.Id + "' uses icon '" + node.Icon + "', which view '" + view.Id + "' does not declare.");
        }

        foreach (var cell in node.CellEntries) {
            if (!columns.Contains(cell.Key)) {
                throw new InvalidOperationException("Node '" + node.Id + "' has a cell for column '" + cell.Key + "', which view '" + view.Id + "' does not have.");
            }
        }
    }
}
