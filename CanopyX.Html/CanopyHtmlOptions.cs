using System;
using System.Collections.Generic;

namespace CanopyX.Html;

/// <summary>
/// Options for writing a CanopyX view as an HTML fragment or page.
/// </summary>
public sealed class CanopyHtmlOptions {
    private string _assetBaseUrl = "assets/";
    private string _language = "en";
    private string? _nonce;

    /// <summary>
    /// Gets or sets how a full page includes the runtime assets. Fragments never include the runtime itself; with
    /// <see cref="CanopyAssetMode.Inline"/> (the default) a fragment carries the inert payloads of the optional parts its view
    /// loads (tree tools, export, filter editor, history presenters), once per <see cref="Document"/> when fragments share one.
    /// </summary>
    public CanopyAssetMode AssetMode { get; set; }

    /// <summary>Gets or sets the browser entry point. Views enabling interaction features automatically use the interactive tree.</summary>
    /// <remarks>For a page hosting several fragments, include the interactive assets once if any fragment needs them.</remarks>
    public CanopyRuntime Runtime { get; set; }

    /// <summary>
    /// Gets or sets how the asset files a page references are named when <see cref="AssetMode"/> is
    /// <see cref="CanopyAssetMode.External"/>. Defaults to <see cref="CanopyAssetNaming.ContentHash"/>
    /// (<c>canopyx.&lt;hash&gt;.js</c>), so a page loads exactly the runtime of the build that wrote it and the files
    /// can be cached without an expiry. <see cref="CanopyAssetNaming.Plain"/> references <c>canopyx.js</c> and
    /// <c>canopyx.css</c>, for a host that versions the files itself.
    /// </summary>
    public CanopyAssetNaming AssetNaming { get; set; }

    /// <summary>
    /// Gets or sets the folder, relative to the page, that holds the runtime script and stylesheet when
    /// <see cref="AssetMode"/> is <see cref="CanopyAssetMode.External"/>. Backslashes in relative folder paths become
    /// URL slashes so saved bundle assets use the same path as the generated page. Defaults to <c>assets/</c>.
    /// </summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public string AssetBaseUrl {
        get => _assetBaseUrl;
        set {
            var url = (value ?? throw new ArgumentNullException(nameof(value))).Replace('\\', '/');
            _assetBaseUrl = url.Length == 0 || url.EndsWith("/", StringComparison.Ordinal) ? url : url + "/";
        }
    }

    /// <summary>
    /// Gets or sets whether the runtime mounts the view by itself when the page has loaded. Defaults to true. Set it
    /// to false when the host page mounts the view later with <c>CanopyX.mount(root)</c>, for example after its own
    /// scripts have loaded. A host that only needs to hand the view its renderers or callbacks can leave this on and
    /// call <c>CanopyX.configure(viewId, options)</c> from a script that runs before the page has loaded. A page from
    /// <c>ToHtmlPage</c> or <c>SaveHtmlBundle</c> has no script of its own, so with false it shows nothing until a
    /// script the host adds calls <c>CanopyX.mount()</c>.
    /// </summary>
    public bool AutoMount { get; set; } = true;

    /// <summary>
    /// Gets or sets whether the runtime mounts the view only when it comes near the visible part of the page: within half a
    /// window height of it, when a hidden tab or a closed panel that holds it opens, or when printing starts (a browser may print such a view before its rows have rendered). Until then
    /// the view's configuration and rows are not even parsed, so a page with many views, most of them in tabs or below the
    /// fold, shows its first view sooner and keeps less in memory. Defaults to false. Applies when <see cref="AutoMount"/>
    /// is true; the fragment is marked <c>data-cx-mount="visible"</c>. A host script reaches such a view after it has mounted
    /// (<c>host.canopyx</c>), or mounts it at once with <c>CanopyX.mount(host)</c>.
    /// </summary>
    public bool MountWhenVisible { get; set; }

    /// <summary>
    /// Gets or sets how a flat grid with an inline source carries its rows. Null (the default) writes them as objects in the
    /// grid document. Options write them as compact row data (<see cref="CanopyGridRowData"/>): arrays in column order, in
    /// chunks inside the grid's host element that the browser decodes one at a time after the first rows have painted,
    /// optionally gzip-compressed. Single-file fragments then also carry the row data part (<c>canopyx-data.js</c>). Trees
    /// and hosted grids ignore it.
    /// </summary>
    public CanopyRowDataOptions? RowData { get; set; }

    /// <summary>
    /// Gets the ids of the view's filters whose switch the toolbar leaves out on this page, because the host draws its
    /// own control for them (see <see cref="CanopyFilter.Hidden"/>). The view is not changed, so one view can be written
    /// for hosts with and without their own filter bar at the same time. Writing the page fails when an id is not one of
    /// the view's filters.
    /// </summary>
    public ISet<string> HiddenFilterIds { get; } = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>
    /// Gets or sets the HTML document the fragment is written into. Inline fragments that share a document embed the tree
    /// tools part, the grid export part, the filter editor and the history presenters once, in the first fragment that needs each; without one,
    /// every inline fragment carries its own copies. Pages ignore it. See <see cref="CanopyHtmlDocument"/>.
    /// </summary>
    public CanopyHtmlDocument? Document { get; set; }

    /// <summary>Gets or sets the colour theme.</summary>
    public CanopyTheme Theme { get; set; }

    /// <summary>
    /// Gets or sets the Content Security Policy nonce of the response the markup is served in, or null (the default) for
    /// none. With a nonce, every element CanopyX writes that a strict policy
    /// (<c>script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'</c>) would otherwise block carries it: the inline
    /// runtime script and stylesheet of a page, the script and stylesheet references of a page with external assets, the
    /// inert payloads of the optional parts, which the runtime inserts with the same nonce when it loads them, and the rule
    /// that gives a fragment its <see cref="Height"/> in place of a <c>style</c> attribute. The view document is a JSON data
    /// block, which a policy does not restrict. A nonce must be new for every response, so write the markup per response,
    /// or put a placeholder here and replace it per response. See <c>docs/security.md</c>.
    /// </summary>
    /// <exception cref="ArgumentException">The value is not a valid nonce: base64 or base64url characters, optionally followed by up to two <c>=</c>.</exception>
    public string? Nonce {
        get => _nonce;
        set => _nonce = value == null ? null : CanopyContentSecurity.Validate(value, nameof(value));
    }

    /// <summary>
    /// Gets or sets the height of the view as a CSS length, for example <c>600px</c> or <c>70vh</c>. Fragments without
    /// a height use the stylesheet default (480px); full pages fill the window.
    /// </summary>
    public string? Height { get; set; }

    /// <summary>Gets or sets the page title. Defaults to the view label.</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets the page language, used for the <c>lang</c> attribute and number formatting. Defaults to <c>en</c>.</summary>
    /// <exception cref="ArgumentException">The value is null or empty.</exception>
    public string Language {
        get => _language;
        set => _language = string.IsNullOrEmpty(value) ? throw new ArgumentException("Language is required.", nameof(value)) : value;
    }
}
