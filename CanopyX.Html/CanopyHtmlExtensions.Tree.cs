using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using CanopyX.Bundles;

namespace CanopyX.Html;

/// <summary>
/// Writes a <see cref="CanopyTreeView"/> as HTML: a fragment for pages a host assembles, or a complete page.
/// </summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>
    /// Writes the view as a fragment: a host element carrying the view document as a JSON configuration script.
    /// </summary>
    /// <remarks>
    /// The fragment does not include the runtime. Include <see cref="CanopyHtmlAssets.Style"/> and
    /// <see cref="CanopyHtmlAssets.Script"/> once per page (or reference the files); the script mounts every fragment
    /// on the page. <see cref="CanopyHtmlOptions.AssetMode"/> does not apply to fragments.
    /// </remarks>
    /// <param name="view">The view.</param>
    /// <param name="options">Theme, height, automatic mounting, and the filters whose switches the page hides; other options apply to full pages only.</param>
    /// <returns>The fragment markup.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or <see cref="CanopyHtmlOptions.HiddenFilterIds"/> names a filter the view does not declare.</exception>
    public static string ToHtmlFragment(this CanopyTreeView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(view, options ?? new CanopyHtmlOptions());

    /// <summary>Writes the view as a complete HTML page that fills the browser window.</summary>
    /// <param name="view">The view.</param>
    /// <param name="options">Asset mode, theme, title, language, and the filters whose switches the page hides.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or <see cref="CanopyHtmlOptions.HiddenFilterIds"/> names a filter the view does not declare.</exception>
    public static string ToHtmlPage(this CanopyTreeView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Page(view ?? throw new ArgumentNullException(nameof(view)), options ?? new CanopyHtmlOptions());

    /// <summary>Saves the view as a complete HTML page, creating the folder when needed.</summary>
    /// <param name="view">The view.</param>
    /// <param name="path">The file path of the page.</param>
    /// <param name="options">Asset mode, theme, title, and language.</param>
    /// <remarks>
    /// With <see cref="CanopyAssetMode.External"/>, also write the assets with <see cref="CanopyHtmlAssets.WriteTo(string, CanopyAssetNaming, CanopyRuntime)"/>
    /// into the folder that <see cref="CanopyHtmlOptions.AssetBaseUrl"/> points to, under the naming of the options.
    /// Checking, editing, drop, context actions, or translated interaction labels use <see cref="CanopyRuntime.InteractiveTreeGrid"/>;
    /// other views use <see cref="CanopyHtmlOptions.Runtime"/>.
    /// </remarks>
    /// <exception cref="ArgumentException"><paramref name="path"/> is null or empty.</exception>
    public static void SaveHtmlPage(this CanopyTreeView view, string path, CanopyHtmlOptions? options = null) {
        if (string.IsNullOrEmpty(path)) {
            throw new ArgumentException("Path is required.", nameof(path));
        }

        var html = view.ToHtmlPage(options);
        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory)) {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(path, html, new UTF8Encoding(false));
    }

    /// <summary>
    /// Saves the view as a bundle: the tree split into sidecar files, the runtime assets, and an <c>index.html</c>
    /// page that loads the data on demand, also when opened from a file share.
    /// </summary>
    /// <remarks>
    /// The view's <see cref="CanopyTreeView.Roots"/> must carry the complete tree. The method points
    /// <see cref="CanopyTreeView.Source"/> at the written sidecar files before it writes the page. Without
    /// <paramref name="options"/>, the page references the runtime script and stylesheet under <c>assets/</c> by their
    /// content-hashed names (<see cref="CanopyHtmlAssets.HashedScriptFileName"/>), so it loads the runtime it was written for; they are
    /// written next to it; with options, their asset mode applies, and assets are written when the base URL is a
    /// relative folder inside <paramref name="directory"/>. Local asset and data folders use separate directory trees;
    /// internal dot segments are rejected. A leading <c>./</c> is allowed. Invalid layouts fail before writing.
    /// If writing fails, the view keeps its previous source.
    /// </remarks>
    /// <param name="view">The view.</param>
    /// <param name="directory">The folder for the page, the <c>assets</c> folder, and the data folder.</param>
    /// <param name="options">Page options; defaults to external assets under <c>assets/</c>.</param>
    /// <param name="bundleOptions">Page size, search shard limit, and data folder.</param>
    /// <returns>What the bundle writer wrote, for checking sizes against budgets.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or the tree is incomplete.</exception>
    public static CanopyBundleResult SaveHtmlBundle(this CanopyTreeView view, string directory, CanopyHtmlOptions? options = null, CanopyBundleOptions? bundleOptions = null) =>
        SaveBundle(view, directory, options, bundleOptions, writer => writer.Write(view, directory));

    /// <summary>
    /// Saves the view as a bundle from nodes the host supplies while the tree is written, so the tree never has to be
    /// in memory as a whole. The page, assets, and layout rules are those of
    /// <see cref="SaveHtmlBundle(CanopyTreeView, string, CanopyHtmlOptions, CanopyBundleOptions)"/>; how the nodes are read
    /// is described at <see cref="CanopyBundleWriter.Write(CanopyTreeView, string, IEnumerable{CanopyNode}, Func{CanopyNode, IEnumerable{CanopyNode}})"/>.
    /// </summary>
    /// <param name="view">The view. Its <see cref="CanopyTreeView.Roots"/> must be empty.</param>
    /// <param name="directory">The folder for the page, the <c>assets</c> folder, and the data folder.</param>
    /// <param name="roots">The top-level nodes in display order.</param>
    /// <param name="children">Returns the children of a node in display order, or null or an empty sequence for a leaf.</param>
    /// <param name="options">Page options; defaults to external assets under <c>assets/</c>.</param>
    /// <param name="bundleOptions">Page size, search shard limit, and data folder.</param>
    /// <returns>What the bundle writer wrote, for checking sizes against budgets.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/>, <paramref name="roots"/>, or <paramref name="children"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty, or the view has roots of its own.</exception>
    /// <exception cref="InvalidOperationException">The view or a node breaks a protocol rule.</exception>
    public static CanopyBundleResult SaveHtmlBundle(this CanopyTreeView view, string directory, IEnumerable<CanopyNode> roots, Func<CanopyNode, IEnumerable<CanopyNode>?> children,
        CanopyHtmlOptions? options = null, CanopyBundleOptions? bundleOptions = null) =>
        SaveBundle(view, directory, options, bundleOptions, writer => writer.Write(view, directory, roots, children));

    private static CanopyBundleResult SaveBundle(CanopyTreeView view, string directory, CanopyHtmlOptions? options, CanopyBundleOptions? bundleOptions, Func<CanopyBundleWriter, CanopyBundleResult> write) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        if (string.IsNullOrEmpty(directory)) {
            throw new ArgumentException("Directory is required.", nameof(directory));
        }

        var pageOptions = options ?? new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        var assetFolder = pageOptions.AssetBaseUrl;
        while (assetFolder.StartsWith("./", StringComparison.Ordinal)) assetFolder = assetFolder.Substring(2);
        var localAssets = pageOptions.AssetMode == CanopyAssetMode.External && IsLocalFolder(assetFolder);
        if (localAssets) {
            var folder = assetFolder.EndsWith("/", StringComparison.Ordinal) ? assetFolder.Substring(0, assetFolder.Length - 1) : assetFolder;
            foreach (var component in folder.Length == 0 ? Array.Empty<string>() : folder.Split('/')) {
                if (!CanopyX.Bundles.PortableFolderNames.IsPortableComponent(component)) {
                    throw new ArgumentException("Asset folders must contain portable names of at most 255 characters, without empty components, trailing dots, or reserved device names.", nameof(options));
                }
            }
        }
        // A mistyped filter id fails before the data is written, not when the page is.
        foreach (var id in pageOptions.HiddenFilterIds) {
            if (!view.Filters.Any(filter => filter.Id == id)) {
                throw new InvalidOperationException("View '" + view.Id + "' declares no filter '" + id + "' to hide.");
            }
        }

        var runtime = CanopyHtmlWriter.RuntimeFor(view, pageOptions);
        ValidateBundleLayout(CanopyX.Bundles.BundlePaths.DataPath(view.Id, bundleOptions?.DataPath), localAssets ? assetFolder : null, runtime);
        var previousSource = view.Source;
        var result = write(new CanopyBundleWriter(bundleOptions));
        view.Source = result.Source;
        try {
            if (localAssets) {
                var assets = assetFolder.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar);
                CanopyHtmlAssets.WriteTo(assets.Length == 0 ? directory : Path.Combine(directory, assets), pageOptions.AssetNaming, runtime);
            }

            view.SaveHtmlPage(Path.Combine(directory, "index.html"), pageOptions);
        } catch {
            view.Source = previousSource;
            throw;
        }

        return result;
    }

    /// <summary>Rejects page/file collisions and overlapping local asset/data trees before any output is written.</summary>
    private static void ValidateBundleLayout(string dataFolder, string? assetFolder, CanopyRuntime runtime) {
        bool Under(string path, string folder) => path.StartsWith(folder, StringComparison.OrdinalIgnoreCase);
        if (Under(dataFolder, "index.html/") || (assetFolder != null && Under(assetFolder, "index.html/"))) {
            throw new ArgumentException("Bundle folders cannot occupy the index.html page path.");
        }
        if (assetFolder == null) return;
        // Under either naming, so a folder that is fine today does not block the other naming tomorrow.
        foreach (var file in new[] { CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.Plain, runtime),
            CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.Plain, runtime), CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime),
            CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime) }) {
            if (Under(dataFolder, assetFolder + file + "/")) {
                throw new ArgumentException("The data folder cannot occupy a runtime asset file path.");
            }
        }
        if (assetFolder.Length != 0 && (Under(dataFolder, assetFolder) || Under(assetFolder, dataFolder))) {
            throw new ArgumentException("Local asset and data folders must use separate directory trees.");
        }
    }

    /// <summary>
    /// True for a relative folder inside the bundle (or empty, meaning next to the page) written with characters that
    /// need no URL encoding; anything else, such as an absolute URL, is left for the host to serve.
    /// </summary>
    private static bool IsLocalFolder(string url) {
        if (url.StartsWith("../", StringComparison.Ordinal) || url.StartsWith("/", StringComparison.Ordinal)) {
            return false;
        }

        foreach (var ch in url) {
            if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '/')) {
                return false;
            }
        }

        return true;
    }
}
