using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Html;

/// <summary>
/// A part of the browser runtime that loads when a view needs it: its script, optional stylesheet, version, file names and
/// inert payload markup. The parts come from <c>Build/parts.json</c>; <see cref="CanopyHtmlAssets.Parts"/> lists them.
/// </summary>
/// <remarks>
/// <para>
/// An entry point knows the parts of its build by name and version. A part installs only when its version is that build's:
/// from an inert payload in the page (<see cref="Markup"/>), or from the file beside the runtime, under the naming of the
/// runtime file (<see cref="GetScriptFileName"/>). <see cref="CanopyHtmlAssets.WriteTo(string, CanopyAssetNaming, CanopyRuntime)"/>
/// writes every part an entry point knows, and fragments written with inline assets carry the payloads of the parts their view
/// needs (<see cref="CanopyHtmlAssets.GetRequiredParts(CanopyTreeView)"/>), once per <see cref="CanopyHtmlDocument"/>.
/// </para>
/// <para>
/// A host that writes its own pages handles every part the same way, so a new part needs no host code: it serves the files
/// of <see cref="CanopyHtmlAssets.GetParts(CanopyRuntime)"/> beside the runtime, or embeds the payloads a view needs.
/// </para>
/// </remarks>
public sealed class CanopyHtmlPart {
    private readonly Lazy<string> _script;
    private readonly Lazy<string?> _style;
    private readonly string[] _views;
    private readonly string[] _sources;
    private readonly string[] _presenters;
    private readonly string[] _features;
    private readonly bool _deepLink;

    // The view features a part can name in Build/parts.json (features); Uses maps each to the view settings that turn it on.
    private static readonly HashSet<string> KnownFeatures = new HashSet<string>(StringComparer.Ordinal) {
        "pager", "editable", "rowData", "formatting", "formatEditor", "columnGroups", "rangeSelection", "grouping", "detail",
        "searchHighlight", "layout", "record"
    };

    internal CanopyHtmlPart(IReadOnlyDictionary<string, object> entry) {
        Name = Text(entry, "name") ?? throw new InvalidOperationException("A CanopyX part has no name.");
        Label = Text(entry, "label") ?? Name;
        Version = Text(entry, "version") ?? throw new InvalidOperationException("The CanopyX part '" + Name + "' has no version.");
        ScriptFileName = Text(entry, "script") ?? throw new InvalidOperationException("The CanopyX part '" + Name + "' has no script.");
        StyleFileName = Text(entry, "style");
        var styleFile = StyleFileName;
        _script = new Lazy<string>(() => CanopyHtmlResources.Read(ScriptFileName));
        _style = new Lazy<string?>(() => styleFile == null ? null : CanopyHtmlResources.Read(styleFile));
        Runtimes = List(entry, "runtimes").SelectMany(RuntimesOf).Distinct().ToList().AsReadOnly();
        Requires = List(entry, "requires").ToList().AsReadOnly();
        _views = List(entry, "views").ToArray();
        _sources = List(entry, "sources").ToArray();
        _presenters = List(entry, "presenters").ToArray();
        _features = List(entry, "features").ToArray();
        _deepLink = entry.TryGetValue("deepLink", out var deepLink) && deepLink is bool flag && flag;
        foreach (var feature in _features) {
            if (!KnownFeatures.Contains(feature)) throw new InvalidOperationException("The CanopyX part '" + Name + "' names the unknown view feature '" + feature + "'.");
        }
    }

    /// <summary>Gets the part's name, for example <c>tree-tools</c> or <c>export</c>.</summary>
    public string Name { get; }

    /// <summary>Gets the part's English description, as the runtime names it in errors.</summary>
    public string Label { get; }

    /// <summary>Gets the part's version: 16 lowercase hex digits shared with the entry points of its build.</summary>
    public string Version { get; }

    /// <summary>Gets the part's script, which registers it with <c>CanopyX.registerPart</c> when it runs.</summary>
    public string Script => _script.Value;

    /// <summary>Gets the part's stylesheet, or null for a part without one.</summary>
    public string? Style => _style.Value;

    /// <summary>Gets the plain file name of the script, <c>canopyx-&lt;name&gt;.js</c>.</summary>
    public string ScriptFileName { get; }

    /// <summary>Gets the plain file name of the stylesheet, <c>canopyx-&lt;name&gt;.css</c>, or null for a part without one.</summary>
    public string? StyleFileName { get; }

    /// <summary>Gets the script file name with its content hash, <c>canopyx-&lt;name&gt;.&lt;hash&gt;.js</c>.</summary>
    public string HashedScriptFileName => "canopyx-" + Name + "." + CanopyHtmlAssets.Hash(Script) + ".js";

    /// <summary>Gets the stylesheet file name with its content hash, or null for a part without a stylesheet.</summary>
    public string? HashedStyleFileName => Style == null ? null : "canopyx-" + Name + "." + CanopyHtmlAssets.Hash(Style) + ".css";

    /// <summary>Gets the entry points that know this part and ship it beside them.</summary>
    public IReadOnlyList<CanopyRuntime> Runtimes { get; }

    /// <summary>Gets the names of the parts this part loads, and installs, before itself.</summary>
    public IReadOnlyList<string> Requires { get; }

    /// <summary>
    /// Gets inert payload markup for a single-file page: the stylesheet (type <c>application/x-canopyx-&lt;name&gt;-style</c>)
    /// and the script (type <c>application/x-canopyx-&lt;name&gt;</c>), marked with the version. The runtime finds the payload
    /// anywhere in the document and runs it on first use.
    /// </summary>
    public string Markup => GetMarkup(null);

    /// <summary>
    /// Returns the inert payload markup (<see cref="Markup"/>) marked with a Content Security Policy nonce. The payloads are
    /// data blocks, which a policy does not run; the runtime inserts the stylesheet and the script with the payload's nonce
    /// when the part loads, so a strict policy (<c>script-src 'nonce-…'; style-src 'nonce-…'</c>) allows them.
    /// </summary>
    /// <param name="nonce">The response's nonce, or null for none (the same as <see cref="Markup"/>).</param>
    /// <returns>The payload markup.</returns>
    /// <exception cref="ArgumentException"><paramref name="nonce"/> is not a valid nonce.</exception>
    public string GetMarkup(string? nonce) {
        var attribute = CanopyContentSecurity.Attribute(nonce);
        return (Style == null ? string.Empty : "<script type=\"application/x-canopyx-" + Name + "-style\" data-cx-version=\"" + Version + "\"" + attribute + ">" + Style + "</script>")
            + "<script type=\"application/x-canopyx-" + Name + "\" data-cx-version=\"" + Version + "\"" + attribute + ">" + Script + "</script>";
    }

    /// <summary>Returns the script file name under a naming.</summary>
    /// <param name="naming">Content-hashed or plain; the naming of the runtime file that loads the part.</param>
    /// <returns><see cref="HashedScriptFileName"/> or <see cref="ScriptFileName"/>.</returns>
    public string GetScriptFileName(CanopyAssetNaming naming) => naming == CanopyAssetNaming.Plain ? ScriptFileName : HashedScriptFileName;

    /// <summary>Returns the stylesheet file name under a naming, or null for a part without a stylesheet.</summary>
    /// <param name="naming">Content-hashed or plain; the naming of the runtime file that loads the part.</param>
    /// <returns><see cref="HashedStyleFileName"/>, <see cref="StyleFileName"/>, or null.</returns>
    public string? GetStyleFileName(CanopyAssetNaming naming) => naming == CanopyAssetNaming.Plain ? StyleFileName : HashedStyleFileName;

    /// <summary>Returns whether an entry point knows this part and ships it beside it.</summary>
    /// <param name="runtime">The entry point.</param>
    /// <returns>True when <see cref="Runtimes"/> contains the entry point.</returns>
    public bool IsShippedWith(CanopyRuntime runtime) => Runtimes.Contains(runtime);

    /// <summary>Whether this part serves a view feature (<c>features</c> in <c>Build/parts.json</c>), for example <c>rowData</c>.</summary>
    internal bool Serves(string feature) => Array.IndexOf(_features, feature) >= 0;

    /// <summary>Whether a tree loads this part: a part for trees, limited to the source kinds, deep links and view features it names.</summary>
    internal bool IsNeededBy(CanopyTreeView view) => Array.IndexOf(_views, "tree") >= 0 && _presenters.Length == 0 &&
        (_sources.Length == 0 || Array.IndexOf(_sources, WireName(view.Source.Kind.ToString())) >= 0) && (!_deepLink || view.DeepLink) &&
        (_features.Length == 0 || _features.Any(feature => Uses(view, feature)));

    /// <summary>Whether a flat grid loads this part: a part for grids, limited to the presenters and view features it names.</summary>
    internal bool IsNeededBy(CanopyDataGridView view) => Array.IndexOf(_views, "grid") >= 0 && _sources.Length == 0 && !_deepLink &&
        // Record fields present their values in the record panel with the same presenters as columns.
        (_presenters.Length == 0 || view.Columns.Concat(view.Record?.Fields ?? Enumerable.Empty<CanopyColumn>()).Any(column => column?.Presenter != null && Array.IndexOf(_presenters, WireName(column.Presenter.Kind.ToString())) >= 0)) &&
        (_features.Length == 0 || _features.Any(feature => Uses(view, feature)));

    /// <summary>
    /// Whether a grid uses a view feature: pager settings, an editable column, formatting rules or the rule editor, column
    /// groups, cell ranges, grouping or aggregates, detail rows, search highlighting, layout modes or the record panel. Compact
    /// row data (<c>rowData</c>) is a writer option, not a view setting: the HTML writer adds the parts that serve it.
    /// </summary>
    private static bool Uses(CanopyDataGridView view, string feature) {
        var reporting = view.Reporting;
        return feature switch {
            "pager" => view.Presentation == CanopyGridPresentation.Paged && !view.Pager.IsDefault,
            "editable" => view.Columns.Any(column => column.Editable),
            "formatting" => view.FormatRules.Count > 0 || view.Formatting != null,
            "formatEditor" => view.Formatting?.Editor == true,
            "columnGroups" => view.ColumnGroups.Count > 0,
            "rangeSelection" => view.RangeSelection != null,
            "grouping" => reporting != null && (reporting.Grouping != null || reporting.GroupBy.Count != 0 || reporting.Groupable || reporting.Aggregates.Count != 0),
            "detail" => reporting?.Detail != null,
            "searchHighlight" => view.SearchHighlight != null,
            "layout" => view.Layout != null,
            "record" => UsesRecordPanel(view),
            _ => false
        };
    }

    /// <summary>Whether a tree uses a view feature: search highlighting, layout modes or the record panel.</summary>
    private static bool Uses(CanopyTreeView view, string feature) => feature switch {
        "searchHighlight" => view.SearchHighlight != null,
        "layout" => view.Layout != null,
        "record" => UsesRecordPanel(view),
        _ => false
    };

    /// <summary>Whether a grid uses the record panel part: a record panel, a structured summary column, or structured cells or record links.</summary>
    private static bool UsesRecordPanel(CanopyDataGridView view) {
        if (view.Record != null) return true;
        foreach (var column in view.Columns) if (column?.Presenter?.Kind == CanopyGridPresenterKind.Structured) return true;
        foreach (var row in view.Rows) if (row != null && (row.HasFields || Structured(row.Cells.Values))) return true;
        return false;
    }

    /// <summary>Whether a tree uses the record panel part: a record panel, or nodes with record fields, structured cells or record links.</summary>
    private static bool UsesRecordPanel(CanopyTreeView view) {
        if (view.Record != null) return true;
        var pending = new Stack<CanopyNode>(view.Roots);
        while (pending.Count > 0) {
            var node = pending.Pop();
            if (node == null) continue;
            if (node.HasFields || node.HasCells && Structured(node.Cells.Values)) return true;
            if (node.HasInlineChildren) foreach (var child in node.Children) pending.Push(child);
        }
        return false;
    }

    private static bool Structured(IEnumerable<CanopyCell> cells) => cells.Any(cell => cell != null && (cell.IsStructured || cell.Ref != null));

    /// <summary>The wire name of an enum member: its name with a lowercase first letter (<c>StatusStrip</c> is <c>statusStrip</c>).</summary>
    private static string WireName(string name) => name.Length == 0 ? name : char.ToLowerInvariant(name[0]) + name.Substring(1);

    private static IEnumerable<CanopyRuntime> RuntimesOf(string kind) => kind switch {
        "tree" => new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid },
        "grid" => new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid },
        _ => throw new InvalidOperationException("Unknown CanopyX part runtime '" + kind + "'.")
    };

    private static string? Text(IReadOnlyDictionary<string, object> entry, string name) => entry.TryGetValue(name, out var value) ? value as string : null;

    private static IEnumerable<string> List(IReadOnlyDictionary<string, object> entry, string name) =>
        entry.TryGetValue(name, out var value) && value is List<object> list ? list.OfType<string>() : Enumerable.Empty<string>();
}
