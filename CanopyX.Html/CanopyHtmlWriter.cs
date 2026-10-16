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
internal static class CanopyHtmlWriter {
    private static readonly Lazy<string> PageTemplate = new Lazy<string>(() => CanopyHtmlResources.Read("page.html"));
    private static readonly Regex Token = new Regex(@"\{\{(\w+)\}\}", RegexOptions.CultureInvariant);

    internal static string Fragment(CanopyTreeView view, CanopyHtmlOptions options) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        // A single-file tree carries the parts it loads (CanopyHtmlAssets.GetRequiredParts): the tree tools part, the export part
        // its Export menu and exports load on first use, and the search and links parts when it needs them. Fragments that share
        // a document carry each part once.
        var html = FragmentDocument(view.ToJson(options.HiddenFilterIds), options);
        var parts = WithRequested(CanopyHtmlAssets.GetRequiredParts(view), options, RuntimeFor(view, options));
        return options.AssetMode != CanopyAssetMode.Inline ? html : html + SharedParts(options, parts);
    }

    /// <summary>The payloads of the parts a view needs, leaving out those the fragment's document already carries.</summary>
    private static string SharedParts(CanopyHtmlOptions options, IEnumerable<CanopyHtmlPart> parts) {
        var builder = new StringBuilder();
        foreach (var part in parts) builder.Append(options.Document == null ? part.GetMarkup(options.Nonce) : options.Document.EmbedOnce(part, options.Nonce));
        return builder.ToString();
    }

    /// <summary>The parts a view needs, then the parts the host asked for (<see cref="CanopyHtmlOptions.Parts"/>), in manifest order.</summary>
    private static List<CanopyHtmlPart> WithRequested(IReadOnlyList<CanopyHtmlPart> required, CanopyHtmlOptions options, CanopyRuntime runtime) {
        var parts = new List<CanopyHtmlPart>(required);
        foreach (var name in options.Parts) {
            var part = CanopyHtmlAssets.GetPart(name);
            if (!part.IsShippedWith(runtime)) throw new InvalidOperationException("The CanopyX part '" + name + "' does not ship with the " + runtime + " runtime.");
        }
        foreach (var part in CanopyHtmlAssets.Parts) {
            if (options.Parts.Contains(part.Name) && !parts.Contains(part)) parts.Add(part);
        }
        return parts;
    }

    /// <summary>The options of the fragment inside a grid page.</summary>
    private static CanopyHtmlOptions PageFragmentOptions(CanopyHtmlOptions options) {
        var fragment = new CanopyHtmlOptions { Theme = options.Theme, AutoMount = options.AutoMount, MountWhenVisible = options.MountWhenVisible,
            AssetMode = options.AssetMode, RowData = options.RowData, Nonce = options.Nonce };
        fragment.Parts.UnionWith(options.Parts);
        return fragment;
    }

    private static string FragmentDocument(string json, CanopyHtmlOptions options, string? content = null) {
        var builder = new StringBuilder(json.Length + (content?.Length ?? 0) + 160);
        builder.Append("<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"").Append(ThemeName(options.Theme)).Append('"');
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
            builder.Append("<style").Append(CanopyContentSecurity.Attribute(options.Nonce)).Append(">[data-cx-height=\"").Append(height)
                .Append("\"]{height:").Append(height).Append("}</style>");
        }

        return builder.ToString();
    }

    internal static string Page(CanopyTreeView view, CanopyHtmlOptions options) {
        var fragmentOptions = new CanopyHtmlOptions { Theme = options.Theme, AutoMount = options.AutoMount, MountWhenVisible = options.MountWhenVisible, Runtime = options.Runtime, AssetMode = options.AssetMode, Nonce = options.Nonce };
        fragmentOptions.HiddenFilterIds.UnionWith(options.HiddenFilterIds);
        fragmentOptions.Parts.UnionWith(options.Parts);
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
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
            html = FragmentDocument(view.ToJson(), options);
        } else {
            var chunks = new StringBuilder();
            for (var index = 0; bundled == null && index < data.ChunkCount; index++) {
                chunks.Append("<script type=\"application/x-canopyx-rows\">").Append(data.GetChunk(index)).Append("</script>");
            }

            html = FragmentDocument(data.ToJson(bundleBase), options, chunks.ToString());
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
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? view.Label : options.Title),
            ["head"] = Head(CanopyHtmlAssets.GetRuntime(view), options),
            ["body"] = Fragment(view, PageFragmentOptions(options), bundled, bundleBase)
        };
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Flat grids use typed query predicates, not tree filter IDs.");
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
