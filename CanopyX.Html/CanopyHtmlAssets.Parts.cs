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
    /// history part for status strips and sparklines, the detail rows and grouping parts for grouping, aggregates and detail rows,
    /// and the parts of a nested detail grid or tree.</summary>
    /// <param name="view">The grid definition.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        // A nested detail grid or tree loads its own parts in the same page.
        var nestedGrid = view.Reporting?.Detail?.View;
        var nestedTree = view.Reporting?.Detail?.TreeView;
        // A record collection held as tree nodes shows as a nested tree in the record panel, which loads the tree tools.
        var treeCollection = view.Rows.Any(row => TreeCollection(row.Cells.Values) || row.HasFields && TreeCollection(row.Fields.Values));
        return Parts.Where(part => part.IsNeededBy(view) || nestedGrid != null && part.IsNeededBy(nestedGrid) || nestedTree != null && part.IsNeededBy(nestedTree) ||
            treeCollection && part.Name == "tree-tools").ToList().AsReadOnly();
    }

    private static bool TreeCollection(IEnumerable<CanopyCell> cells) {
        var pending = new Stack<CanopyCell>(cells.Where(cell => cell != null));
        while (pending.Count > 0) {
            var cell = pending.Pop();
            if (cell.Records != null) {
                if (cell.Records.Roots.Count > 0) return true;
                foreach (var row in cell.Records.Rows) foreach (var inner in row.Cells.Values) if (inner != null) pending.Push(inner);
            }
            if (cell.Fields.Count > 0) foreach (var field in cell.Fields) if (field?.Value != null) pending.Push(field.Value);
        }
        return false;
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
