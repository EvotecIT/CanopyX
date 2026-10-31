using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

/// <summary>
/// Composes fragments and pages. The page shell is the native <c>Assets/page.html</c> template; this class only fills
/// its tokens.
/// </summary>
internal static partial class CanopyHtmlWriter {
    private static readonly Lazy<string> PageTemplate = new Lazy<string>(() => CanopyHtmlResources.Read("page.html"));
    private static readonly Regex Token = new Regex(@"\{\{(\w+)\}\}", RegexOptions.CultureInvariant);

    internal static string Fragment(CanopyTreeView view, CanopyHtmlOptions options) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        // A single-file tree carries the parts it loads (CanopyHtmlAssets.GetRequiredParts): the tree tools part, the export part
        // its Export menu and exports load on first use, and the search and links parts when it needs them. Fragments that share
        // a document carry each part once.
        var html = FragmentDocument(view.ToJson(options.HiddenFilterIds), view.Id, options);
        var parts = WithRequested(CanopyHtmlAssets.GetRequiredParts(view), options, RuntimeFor(view, options));
        return options.AssetMode != CanopyAssetMode.Inline ? html : html + SharedParts(options, parts);
    }

    /// <summary>The payloads of the parts a view needs, leaving out those the fragment's document already carries.</summary>
    private static string SharedParts(CanopyHtmlOptions options, IEnumerable<CanopyHtmlPart> parts) {
        var builder = new StringBuilder();
        foreach (var part in parts) builder.Append(options.Document == null ? part.GetMarkup(options.Nonce) : options.Document.EmbedOnce(part, options.Nonce));
        return builder.ToString();
    }

    /// <summary>The parts a view needs, the parts the host asked for and all their dependencies, in manifest order.</summary>
    private static IReadOnlyList<CanopyHtmlPart> WithRequested(IReadOnlyList<CanopyHtmlPart> required, CanopyHtmlOptions options, CanopyRuntime runtime) {
        var parts = new List<CanopyHtmlPart>(required);
        foreach (var name in options.Parts) {
            var part = CanopyHtmlAssets.GetPart(name);
            if (!part.IsShippedWith(runtime)) throw new InvalidOperationException("The CanopyX part '" + name + "' does not ship with the " + runtime + " runtime.");
        }
        foreach (var part in CanopyHtmlAssets.Parts) {
            if (options.Parts.Contains(part.Name) && !parts.Contains(part)) parts.Add(part);
        }
        return CanopyHtmlAssets.WithRequired(parts);
    }

    /// <summary>The options of the fragment inside a grid page.</summary>
    private static CanopyHtmlOptions PageFragmentOptions(CanopyHtmlOptions options) {
        var fragment = new CanopyHtmlOptions { HostId = options.HostId, Theme = options.Theme, AutoMount = options.AutoMount, MountWhenVisible = options.MountWhenVisible,
            AssetMode = options.AssetMode, RowData = options.RowData, Nonce = options.Nonce, Height = PageHeight(options) };
        fragment.Parts.UnionWith(options.Parts);
        return fragment;
    }

    // Full pages fill the window; only explicit content sizing overrides that default.
    private static string? PageHeight(CanopyHtmlOptions options) => options.Height == "auto" ? "auto" : null;

    private static string FragmentDocument(string json, string viewId, CanopyHtmlOptions options, string? content = null, string hostClass = "cx-host") {
        var builder = new StringBuilder(json.Length + (content?.Length ?? 0) + 160);
        builder.Append("<div class=\"").Append(hostClass).Append("\" data-canopyx-host");
        if (options.Theme != CanopyTheme.Auto) builder.Append(" data-cx-theme=\"").Append(ThemeName(options.Theme)).Append('"');
        builder.Append(" id=\"").Append(WebUtility.HtmlEncode(options.HostId ?? viewId)).Append('"');
        builder.Append(DirectionAttribute(options.Direction));
        if (options.Chrome == CanopyChrome.Embedded) builder.Append(" data-cx-chrome=\"embedded\"");
        if (!options.AutoMount) {
            builder.Append(" data-cx-mount=\"manual\"");
        } else if (options.MountWhenVisible) {
            builder.Append(" data-cx-mount=\"visible\"");
        }

        var height = string.IsNullOrEmpty(options.Height) ? null : ValidateCssLength(options.Height!);
        if (height != null && options.Nonce == null) {
            builder.Append(" style=\"height:").Append(WebUtility.HtmlEncode(height)).Append('"');
        } else if (height != null) {
            // A strict policy blocks style attributes; a nonced rule matched by the attribute gives the host its height instead.
            builder.Append(" data-cx-height=\"").Append(WebUtility.HtmlEncode(height)).Append('"');
        }

        // The JSON writer escapes <, > and &, so the document cannot close the script element early.
        builder.Append("><script type=\"application/json\" class=\"cx-config\">").Append(json).Append("</script>").Append(content).Append("</div>");
        if (height != null && options.Nonce != null) {
            // Explicit sizing also overrides the full-page and nested main-host stylesheet defaults.
            builder.Append("<style").Append(CanopyContentSecurity.Attribute(options.Nonce)).Append(">body .cx-host[data-canopyx-host][data-cx-height=\"").Append(height)
                .Append("\"]{height:").Append(height).Append("}</style>");
        }

        return builder.ToString();
    }

    internal static string Page(CanopyTreeView view, CanopyHtmlOptions options) {
        var fragmentOptions = new CanopyHtmlOptions { HostId = options.HostId, Theme = options.Theme, AutoMount = options.AutoMount, MountWhenVisible = options.MountWhenVisible, Runtime = options.Runtime, AssetMode = options.AssetMode, Nonce = options.Nonce, Height = PageHeight(options) };
        fragmentOptions.HiddenFilterIds.UnionWith(options.HiddenFilterIds);
        fragmentOptions.Parts.UnionWith(options.Parts);
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["dir"] = DirectionAttribute(options.Direction),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? view.Label : options.Title),
            ["head"] = Head(RuntimeFor(view, options), options),
            ["body"] = Fragment(view, fragmentOptions)
        };
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }

    internal static CanopyRuntime RuntimeFor(CanopyTreeView view, CanopyHtmlOptions options)
        => CanopyHtmlAssets.GetRuntime(view, options.Runtime);

    internal static string Fragment(CanopyDataGridView view, CanopyHtmlOptions options) => Fragment(view, options, null, null);

    /// <summary>A grid fragment; <paramref name="bundled"/> is row data a bundle wrote into the sidecar files under <paramref name="bundleBase"/>.</summary>
    private static string Fragment(CanopyDataGridView view, CanopyHtmlOptions options, CanopyGridRowData? bundled, string? bundleBase) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Flat grids use typed query predicates, not tree filter IDs.");
        // Compact row data travels in scripts inside the host element, after the configuration, or in a bundle's sidecar files.
        // The format is chosen from the rows unless the host set one (CanopyRowFormat.Auto, docs/large-data.md).
        var data = bundled ?? (CanopyGridRowData.ShouldWrite(view, options.RowData) ? new CanopyGridRowData(view, options.RowData) : null);
        string html;
        if (data == null) {
            html = FragmentDocument(view.ToJson(), view.Id, options);
        } else {
            var chunks = new StringBuilder();
            for (var index = 0; bundled == null && index < data.ChunkCount; index++) {
                chunks.Append("<script type=\"application/x-canopyx-rows\">").Append(data.GetChunk(index)).Append("</script>");
            }

            html = FragmentDocument(data.ToJson(bundleBase), view.Id, options, chunks.ToString());
        }

        // A single-file grid carries the filter editor and export parts, the history part when it draws history presenters, the
        // parts of the other features it uses and of the parts the host asked for (checked in every asset mode), and the row data
        // part when its rows are compact.
        var required = WithRequested(CanopyHtmlAssets.GetRequiredParts(view), options, CanopyHtmlAssets.GetRuntime(view));
        if (options.AssetMode != CanopyAssetMode.Inline) return html;
        return html + SharedParts(options, CanopyHtmlAssets.Parts.Where(part => required.Contains(part) || data != null && part.Serves("rowData")));
    }

    internal static string Page(CanopyDataGridView view, CanopyHtmlOptions options, CanopyGridRowData? bundled = null, string? bundleBase = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["dir"] = DirectionAttribute(options.Direction),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? view.Label : options.Title),
            ["head"] = Head(CanopyHtmlAssets.GetRuntime(view), options),
            ["body"] = Fragment(view, PageFragmentOptions(options), bundled, bundleBase)
        };
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Flat grids use typed query predicates, not tree filter IDs.");
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }

    /// <summary>A flow fragment: the flow document in a host without a fixed height, and with inline assets the forms and flow parts.</summary>
    internal static string Fragment(CanopyFlow flow, CanopyHtmlOptions options) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Flows have no tree filter IDs.");
        var html = FragmentDocument(flow.ToContract(), flow.Id, options, null, "cx-host cx-flow-host");
        var parts = WithRequested(CanopyHtmlAssets.GetRequiredParts(flow), options, CanopyHtmlAssets.GetRuntime(flow));
        return options.AssetMode != CanopyAssetMode.Inline ? html : html + SharedParts(options, parts);
    }

    internal static string Page(CanopyFlow flow, CanopyHtmlOptions options) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Flows have no tree filter IDs.");
        var fragmentOptions = PageFragmentOptions(options);
        fragmentOptions.Height = options.Height;
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["dir"] = DirectionAttribute(options.Direction),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? flow.Title : options.Title),
            ["head"] = Head(CanopyHtmlAssets.GetRuntime(flow), options),
            ["body"] = Fragment(flow, fragmentOptions)
        };
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }

    /// <summary>A matrix fragment: the matrix document in a host whose height bounds the scrolling cells, and with inline assets the matrix part.</summary>
    internal static string Fragment(CanopyMatrix matrix, CanopyHtmlOptions options) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Matrices have no tree filter IDs.");
        var html = FragmentDocument(matrix.ToJson(), matrix.Id, options, null, "cx-host cx-matrix-host");
        var parts = WithRequested(CanopyHtmlAssets.GetRequiredParts(matrix), options, CanopyRuntime.DataGrid);
        return options.AssetMode != CanopyAssetMode.Inline ? html : html + SharedParts(options, parts);
    }

    internal static string Page(CanopyMatrix matrix, CanopyHtmlOptions options) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Matrices have no tree filter IDs.");
        var fragmentOptions = PageFragmentOptions(options);
        fragmentOptions.Height = options.Height;
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["dir"] = DirectionAttribute(options.Direction),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? matrix.Label : options.Title),
            ["head"] = Head(CanopyRuntime.DataGrid, options),
            ["body"] = Fragment(matrix, fragmentOptions)
        };
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }

    private static string Head(CanopyRuntime runtime, CanopyHtmlOptions options) {
        // With a nonce, every element a strict Content Security Policy checks carries it (docs/security.md).
        var nonce = CanopyContentSecurity.Attribute(options.Nonce);
        if (options.AssetMode == CanopyAssetMode.External) {
            return "<link rel=\"stylesheet\" href=\"" + WebUtility.HtmlEncode(options.AssetBaseUrl + CanopyHtmlAssets.GetStyleFileName(options.AssetNaming, runtime)) + "\"" + nonce + ">\n"
                + "<script src=\"" + WebUtility.HtmlEncode(options.AssetBaseUrl + CanopyHtmlAssets.GetScriptFileName(options.AssetNaming, runtime)) + "\"" + nonce + " defer></script>";
        }

        return "<style" + nonce + ">\n" + CanopyHtmlAssets.GetStyle(runtime) + "</style>\n<script" + nonce + ">\n" + CanopyHtmlAssets.GetScript(runtime) + "</script>";
    }

    /// <summary>The <c>dir</c> attribute of a direction, with its leading space; empty for <see cref="CanopyTextDirection.Auto"/>.</summary>
    private static string DirectionAttribute(CanopyTextDirection direction) => direction switch {
        CanopyTextDirection.Ltr => " dir=\"ltr\"",
        CanopyTextDirection.Rtl => " dir=\"rtl\"",
        _ => string.Empty
    };

    private static string ThemeName(CanopyTheme theme) => theme switch {
        CanopyTheme.Light => "light",
        CanopyTheme.Dark => "dark",
        _ => "auto"
    };

    private static string ValidateCssLength(string value) {
        if (value.IndexOfAny(new[] { ';', '{', '}', '"', '\'', '<', '>', '\\', '\r', '\n' }) >= 0) {
            throw new ArgumentException("Height must be a single CSS length such as 600px or 70vh.", nameof(value));
        }

        return value;
    }
}
