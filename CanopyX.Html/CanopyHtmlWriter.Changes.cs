using System;
using System.Collections.Generic;
using System.Net;

namespace CanopyX.Html;

internal static partial class CanopyHtmlWriter {
    /// <summary>
    /// A change view's fragment (a diff, a change list or a propagation view): its document in a host of natural height (a height in
    /// the options bounds it instead), and with inline assets the changes part.
    /// </summary>
    internal static string ChangeFragment(string json, CanopyHtmlOptions options) {
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Change views have no tree filter IDs.");
        var html = FragmentDocument(json, options, null, "cx-host cx-change-host");
        var parts = WithRequested(CanopyHtmlAssets.GetChangeViewParts(), options, CanopyRuntime.DataGrid);
        return options.AssetMode != CanopyAssetMode.Inline ? html : html + SharedParts(options, parts);
    }

    /// <summary>A change view's page, with the data-grid entry point.</summary>
    internal static string ChangePage(string json, string label, CanopyHtmlOptions options) {
        if (options.HiddenFilterIds.Count != 0) throw new InvalidOperationException("Change views have no tree filter IDs.");
        var fragmentOptions = PageFragmentOptions(options);
        fragmentOptions.Height = options.Height;
        var values = new Dictionary<string, string>(StringComparer.Ordinal) {
            ["lang"] = WebUtility.HtmlEncode(options.Language),
            ["dir"] = DirectionAttribute(options.Direction),
            ["colorScheme"] = options.Theme == CanopyTheme.Light ? "light" : options.Theme == CanopyTheme.Dark ? "dark" : "light dark",
            ["title"] = WebUtility.HtmlEncode(string.IsNullOrEmpty(options.Title) ? label : options.Title),
            ["head"] = Head(CanopyRuntime.DataGrid, options),
            ["body"] = ChangeFragment(json, fragmentOptions)
        };
        return Token.Replace(PageTemplate.Value, match => values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);
    }
}
