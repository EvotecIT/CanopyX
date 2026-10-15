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
    private readonly bool _deepLink;
    private readonly bool _pager;
    private readonly bool _editable;
    private readonly string? _feature;

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
        _deepLink = entry.TryGetValue("deepLink", out var deepLink) && deepLink is bool flag && flag;
        _pager = entry.TryGetValue("pager", out var pager) && pager is bool pagerFlag && pagerFlag;
        _editable = entry.TryGetValue("editable", out var editable) && editable is bool editing && editing;
        _feature = Text(entry, "feature");
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

    /// <summary>Whether a tree loads this part: a part for trees, limited to the source kinds and deep links it names.</summary>
    internal bool IsNeededBy(CanopyTreeView view) => Array.IndexOf(_views, "tree") >= 0 && _presenters.Length == 0 && !_pager && _feature == null &&
        (_sources.Length == 0 || Array.IndexOf(_sources, WireName(view.Source.Kind.ToString())) >= 0) && (!_deepLink || view.DeepLink);

    /// <summary>Whether a flat grid loads this part: a part for grids, limited to the presenters it names, or to views with pager settings.</summary>
    internal bool IsNeededBy(CanopyDataGridView view) => Array.IndexOf(_views, "grid") >= 0 && _sources.Length == 0 && !_deepLink && (!_pager || view.Presentation == CanopyGridPresentation.Paged && !view.Pager.IsDefault) &&
        (_presenters.Length == 0 || view.Columns.Any(column => column.Presenter != null && Array.IndexOf(_presenters, WireName(column.Presenter.Kind.ToString())) >= 0)) &&
        (!_editable || view.Columns.Any(column => column.Editable)) &&
        (_feature == null || _feature == "formatting" && (view.FormatRules.Count > 0 || view.Formatting != null) || _feature == "formatEditor" && view.Formatting?.Editor == true);

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
