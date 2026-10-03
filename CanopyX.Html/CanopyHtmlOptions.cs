using System;
using System.Collections.Generic;

namespace CanopyX.Html;

/// <summary>
/// Options for writing a CanopyX view as an HTML fragment or page.
/// </summary>
public sealed class CanopyHtmlOptions {
    private string _assetBaseUrl = "assets/";
    private string _language = "en";

    /// <summary>Gets or sets how a full page includes the runtime assets. Fragments never include them.</summary>
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
    /// Gets the ids of the view's filters whose switch the toolbar leaves out on this page, because the host draws its
    /// own control for them (see <see cref="CanopyFilter.Hidden"/>). The view is not changed, so one view can be written
    /// for hosts with and without their own filter bar at the same time. Writing the page fails when an id is not one of
    /// the view's filters.
    /// </summary>
    public ISet<string> HiddenFilterIds { get; } = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the colour theme.</summary>
    public CanopyTheme Theme { get; set; }

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
