using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    private static readonly Lazy<IReadOnlyList<CanopyHtmlPart>> PartList = new Lazy<IReadOnlyList<CanopyHtmlPart>>(() =>
        CanopyPartManifest.Read(CanopyHtmlResources.Read("canopyx-parts.json")).Select(entry => new CanopyHtmlPart(entry)).ToList().AsReadOnly());

    /// <summary>Gets every part of the browser runtime that loads when a view needs it, in manifest order.</summary>
    /// <remarks>
    /// The list comes from <c>Build/parts.json</c> through the embedded manifest, so a part added there is written, embedded and
    /// served by the same code as the parts before it.
    /// </remarks>
    public static IReadOnlyList<CanopyHtmlPart> Parts => PartList.Value;

    /// <summary>Gets a part by name.</summary>
    /// <param name="name">The part's name, for example <c>tree-tools</c>, <c>export</c> or <c>search</c>.</param>
    /// <returns>The part.</returns>
    /// <exception cref="ArgumentException">No part has that name.</exception>
    public static CanopyHtmlPart GetPart(string name) =>
        Parts.FirstOrDefault(part => part.Name == name) ?? throw new ArgumentException("Unknown CanopyX part '" + name + "'.", nameof(name));

    /// <summary>Gets the parts an entry point knows, which hosts serve beside its files.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>The parts shipped with that entry point, in manifest order.</returns>
    public static IReadOnlyList<CanopyHtmlPart> GetParts(CanopyRuntime runtime) => Parts.Where(part => part.IsShippedWith(runtime)).ToList().AsReadOnly();

    /// <summary>Gets the parts a tree loads, whose payloads a single-file page carries: the tree tools and export parts, and the
    /// search part for a sidecar source and the links part for deep links.</summary>
    /// <param name="view">The tree view.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyTreeView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        return Parts.Where(part => part.IsNeededBy(view)).ToList().AsReadOnly();
    }

    /// <summary>Gets the parts a flat grid loads, whose payloads a single-file page carries: the filter editor and export parts, the
    /// history part for status strips and sparklines, the pager part for a paged view with pager settings, the detail rows and
    /// grouping parts for grouping, aggregates and detail rows, the parts of the other features the view uses, and the parts of a
    /// nested detail grid or tree.</summary>
    /// <param name="view">The grid definition.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        var required = RequiredGridParts(view);
        return Parts.Where(required.Contains).ToList().AsReadOnly();
    }

    private static HashSet<CanopyHtmlPart> RequiredGridParts(CanopyDataGridView view) {
        // These model objects use reference equality. Shared values and definitions need only one visit; invalid cycles
        // must not trap asset discovery before Core's shape validation can reject them.
        var pending = new Stack<object>();
        var visited = new HashSet<object>();
        var required = new HashSet<CanopyHtmlPart>();
        var treeTools = GetPart("tree-tools");
        void QueueCell(CanopyCell? cell) { if (cell?.IsStructured == true) pending.Push(cell); }
        void QueueRow(CanopyGridRow? row) {
            if (row == null) return;
            if (row.HasFields || row.Detail != null) { pending.Push(row); return; }
            // Ordinary scalar rows need no graph entry or retained identity, even in very large inline grids.
            foreach (var cell in row.Cells.Values) if (cell?.IsStructured == true) { pending.Push(row); break; }
        }
        pending.Push(view);
        while (pending.Count > 0) {
            var current = pending.Pop();
            if (!visited.Add(current)) continue;
            switch (current) {
                case CanopyDataGridView gridView:
                    // Every nested definition loads its own companions in this page, even when a sibling already needs tree tools.
                    foreach (var part in Parts) if (part.IsNeededBy(gridView)) required.Add(part);
                    if (gridView.Source.Kind == CanopyGridSourceKind.Host || gridView.Record != null && gridView.Record.Source.Kind != CanopyRecordSourceKind.Inline)
                        required.Add(treeTools);
                    if (gridView.Reporting?.Detail?.View != null) pending.Push(gridView.Reporting.Detail.View);
                    if (gridView.Reporting?.Detail?.TreeView != null) pending.Push(gridView.Reporting.Detail.TreeView);
                    foreach (var row in gridView.Rows) QueueRow(row);
                    break;
                case CanopyTreeView treeView:
                    foreach (var part in Parts) if (part.IsNeededBy(treeView)) required.Add(part);
                    break;
                case CanopyGridRow gridRow:
                    foreach (var cell in gridRow.Cells.Values) QueueCell(cell);
                    if (gridRow.HasFields) foreach (var cell in gridRow.Fields.Values) QueueCell(cell);
                    if (gridRow.Detail != null) pending.Push(gridRow.Detail);
                    break;
                case CanopyCell value:
                    if (!value.IsStructured) break;
                    if (value.Records != null) {
                        if (value.Records.Roots.Count > 0) required.Add(treeTools);
                        foreach (var record in value.Records.Rows) QueueRow(record);
                    }
                    foreach (var field in value.Fields) QueueCell(field?.Value);
                    foreach (var change in value.Changes) if (change != null) pending.Push(change);
                    foreach (var item in value.Events) if (item != null) pending.Push(item);
                    break;
                case CanopyFieldChange fieldChange:
                    QueueCell(fieldChange.Before);
                    QueueCell(fieldChange.After);
                    break;
                case CanopyRecordEvent recordEvent:
                    foreach (var change in recordEvent.Changes) if (change != null) pending.Push(change);
                    break;
                case CanopyPropertiesDetail properties:
                    foreach (var property in properties.Items) QueueCell(property?.Value);
                    break;
                case CanopyTableDetail table:
                    foreach (var cells in table.Rows) if (cells != null) foreach (var cell in cells) QueueCell(cell);
                    break;
                case CanopyGridRowsDetail gridDetail:
                    foreach (var row in gridDetail.Rows) QueueRow(row);
                    break;
                case CanopyTreeDetail _:
                    required.Add(treeTools);
                    break;
            }
        }
        return required;
    }

    /// <summary>Writes a part's script and stylesheet under a naming; content-hashed files are written once.</summary>
    private static void WritePart(CanopyHtmlPart part, string directory, CanopyAssetNaming naming) {
        WriteAsset(Path.Combine(directory, part.GetScriptFileName(naming)), part.Script, naming);
        if (part.Style != null) WriteAsset(Path.Combine(directory, part.GetStyleFileName(naming)!), part.Style, naming);
    }

    private static void WriteAsset(string path, string content, CanopyAssetNaming naming) {
        path = Path.GetFullPath(path);
        if (naming == CanopyAssetNaming.Plain) File.WriteAllText(path, content, FileEncoding);
        else WriteOnce(path, FileEncoding.GetBytes(content));
    }
}
