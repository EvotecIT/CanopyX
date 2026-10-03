using System;
using System.Collections.Generic;
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

    internal static string Fragment(CanopyView view, CanopyHtmlOptions options) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        var json = view.ToJson(options.HiddenFilterIds);
        var builder = new StringBuilder(json.Length + 160);
        builder.Append("<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"").Append(ThemeName(options.Theme)).Append('"');
        if (!options.AutoMount) {
            builder.Append(" data-cx-mount=\"manual\"");
        }

        if (!string.IsNullOrEmpty(options.Height)) {
            builder.Append(" style=\"height:").Append(WebUtility.HtmlEncode(ValidateCssLength(options.Height!))).Append('"');
        }

        // The JSON writer escapes <, > and &, so the document cannot close the script element early.
        builder.Append("><script type=\"application/json\" class=\"cx-config\">").Append(json).Append("</script></div>");
        return builder.ToString();
    }

    internal static string Page(CanopyView view, CanopyHtmlOptions options) {
        var fragmentOptions = new CanopyHtmlOptions { Theme = options.Theme, AutoMount = options.AutoMount };
        fragmentOptions.HiddenFilterIds.UnionWith(options.HiddenFilterIds);
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? view.Label : options.Title),
            ["head"] = Head(view, options),
            ["body"] = Fragment(view, fragmentOptions)
        };
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }

    internal static CanopyRuntime RuntimeFor(CanopyView view, CanopyHtmlOptions options)
        => CanopyHtmlAssets.GetRuntime(view, options.Runtime);

    private static string Head(CanopyView view, CanopyHtmlOptions options) {
        var runtime = RuntimeFor(view, options);
        if (options.AssetMode == CanopyAssetMode.External) {
            return "<link rel=\"stylesheet\" href=\"" + WebUtility.HtmlEncode(options.AssetBaseUrl + CanopyHtmlAssets.GetStyleFileName(options.AssetNaming, runtime)) + "\">\n"
                + "<script src=\"" + WebUtility.HtmlEncode(options.AssetBaseUrl + CanopyHtmlAssets.GetScriptFileName(options.AssetNaming, runtime)) + "\" defer></script>";
        }

        return "<style>\n" + CanopyHtmlAssets.GetStyle(runtime) + "</style>\n<script>\n" + CanopyHtmlAssets.GetScript(runtime) + "</script>";
    }

    private static string ThemeName(CanopyTheme theme) => theme switch {
        CanopyTheme.Light => "light",
        CanopyTheme.Dark => "dark",
        _ => "auto"
    };

    private static string ValidateCssLength(string value) {
        if (value.IndexOfAny(new[] { ';', '{', '}', '"', '\'', '<', '>' }) >= 0) {
            throw new ArgumentException("Height must be a single CSS length such as 600px or 70vh.", nameof(value));
        }

        return value;
    }
}
