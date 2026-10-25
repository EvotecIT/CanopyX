using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Checks a versioned grid-view proposal against the actual target definition without changing it.</summary>
public static class CanopyViewIntentValidator {
    /// <summary>The maximum proposal length in UTF-16 code units.</summary>
    public const int MaximumLength = 65536;

    /// <summary>Reads a strict JSON snapshot and reuses the grid's typed query validation.</summary>
    /// <param name="json">A <c>canopyx/2</c>, <c>viewIntent</c> document, version 1.</param>
    /// <param name="view">The owning grid, including its column capabilities and grouping policy.</param>
    /// <returns>An immutable proposal safe to preview; applying it remains an explicit browser or host operation.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="FormatException">The text is malformed, duplicated, too large, or exceeds the JSON reader bounds.</exception>
    /// <exception cref="InvalidOperationException">The envelope or a requested operation is not supported by this grid.</exception>
    public static CanopyViewIntent Validate(string json, CanopyDataGridView view) {
        if (json == null) throw new ArgumentNullException(nameof(json));
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (json.Length > MaximumLength) throw new FormatException("A view intent holds at most 65,536 characters.");
        view.Validate();
        var root = CanopyFlowContract.Object(CanopyJsonReader.Parse(json), "View intent", "protocol", "type", "version", "view", "query", "columns");
        if (CanopyFlowContract.RequiredText(root, "protocol", "View intent") != CanopyProtocol.Version ||
            CanopyFlowContract.RequiredText(root, "type", "View intent") != "viewIntent" ||
            CanopyFlowContract.Number(root, "version", "View intent") != CanopyViewIntent.Version ||
            CanopyFlowContract.RequiredText(root, "view", "View intent") != view.Id)
            throw new InvalidOperationException("A view intent must identify its protocol, version and owning grid.");
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) columns.Add(column.Id, column);
        Dictionary<string, object?>? patch = null;
        if (root.TryGetValue("query", out var queryNode)) {
            patch = CanopyFlowContract.Object(queryNode, "Intent query", "search", "searchMode", "sort", "filters", "filterGroup", "groupBy");
            var query = CanopyViewIntentQuery.Read(patch, view, columns);
            query.Validate(view);
        }
        string[]? visible = null;
        if (root.ContainsKey("columns")) {
            var items = CanopyFlowContract.Items(root, "columns", "View intent", 256);
            if (items.Count == 0) throw new InvalidOperationException("An intent must keep at least one column visible.");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            visible = new string[items.Count];
            for (var index = 0; index < items.Count; index++) {
                if (!(items[index] is string id) || !columns.ContainsKey(id) || !seen.Add(id))
                    throw new InvalidOperationException("Visible columns must be unique declared column identities.");
                visible[index] = id;
            }
        }
        if ((patch == null || patch.Count == 0) && visible == null) throw new InvalidOperationException("A view intent needs a query change or visible columns.");
        var writer = new CanopyJsonWriter();
        CanopyFlowContract.WriteNode(writer, root);
        return new CanopyViewIntent(view.Id, writer.ToString(), visible);
    }
}
