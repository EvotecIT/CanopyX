using System;
using System.IO;
using System.Text;
using CanopyX.Bundles;

namespace CanopyX.Html;

/// <summary>
/// Writes a <see cref="CanopyView"/> as HTML: a fragment for pages a host assembles, or a complete page.
/// </summary>
public static class CanopyViewHtmlExtensions {
    /// <summary>
    /// Writes the view as a fragment: a host element carrying the view document as a JSON configuration script.
    /// </summary>
    /// <remarks>
    /// The fragment does not include the runtime. Include <see cref="CanopyHtmlAssets.Style"/> and
    /// <see cref="CanopyHtmlAssets.Script"/> once per page (or reference the files); the script mounts every fragment
    /// on the page. <see cref="CanopyHtmlOptions.AssetMode"/> does not apply to fragments.
    /// </remarks>
    /// <param name="view">The view.</param>
    /// <param name="options">Theme and height; other options apply to full pages only.</param>
    /// <returns>The fragment markup.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule.</exception>
    public static string ToHtmlFragment(this CanopyView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(view, options ?? new CanopyHtmlOptions());

    /// <summary>Writes the view as a complete HTML page that fills the browser window.</summary>
    /// <param name="view">The view.</param>
    /// <param name="options">Asset mode, theme, title, and language.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule.</exception>
    public static string ToHtmlPage(this CanopyView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Page(view ?? throw new ArgumentNullException(nameof(view)), options ?? new CanopyHtmlOptions());

    /// <summary>Saves the view as a complete HTML page, creating the folder when needed.</summary>
    /// <param name="view">The view.</param>
    /// <param name="path">The file path of the page.</param>
    /// <param name="options">Asset mode, theme, title, and language.</param>
    /// <remarks>
    /// With <see cref="CanopyAssetMode.External"/>, also write the assets with <see cref="CanopyHtmlAssets.WriteTo(string)"/>
    /// into the folder that <see cref="CanopyHtmlOptions.AssetBaseUrl"/> points to.
    /// </remarks>
    /// <exception cref="ArgumentException"><paramref name="path"/> is null or empty.</exception>
    public static void SaveHtmlPage(this CanopyView view, string path, CanopyHtmlOptions? options = null) {
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
    /// The view's <see cref="CanopyView.Roots"/> must carry the complete tree. The method points
    /// <see cref="CanopyView.Source"/> at the written sidecar files before it writes the page. Without
    /// <paramref name="options"/>, the page references <c>assets/canopyx.js</c> and <c>assets/canopyx.css</c>, which are
    /// written next to it; with options, their asset mode applies, and assets are written when the base URL is a
    /// relative folder inside <paramref name="directory"/>. If writing fails, the view keeps its previous source.
    /// </remarks>
    /// <param name="view">The view.</param>
    /// <param name="directory">The folder for the page, the <c>assets</c> folder, and the data folder.</param>
    /// <param name="options">Page options; defaults to external assets under <c>assets/</c>.</param>
    /// <param name="bundleOptions">Page size, search shard limit, and data folder.</param>
    /// <returns>What the bundle writer wrote, for checking sizes against budgets.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or the tree is incomplete.</exception>
    public static CanopyBundleResult SaveHtmlBundle(this CanopyView view, string directory, CanopyHtmlOptions? options = null, CanopyBundleOptions? bundleOptions = null) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        if (string.IsNullOrEmpty(directory)) {
            throw new ArgumentException("Directory is required.", nameof(directory));
        }

        var pageOptions = options ?? new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        var previousSource = view.Source;
        var result = new CanopyBundleWriter(bundleOptions).Write(view, directory);
        view.Source = result.Source;
        try {
            if (pageOptions.AssetMode == CanopyAssetMode.External && IsLocalFolder(pageOptions.AssetBaseUrl)) {
                var assets = pageOptions.AssetBaseUrl.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar);
                CanopyHtmlAssets.WriteTo(assets.Length == 0 ? directory : Path.Combine(directory, assets));
            }

            view.SaveHtmlPage(Path.Combine(directory, "index.html"), pageOptions);
        } catch {
            view.Source = previousSource;
            throw;
        }

        return result;
    }

    /// <summary>
    /// True for a relative folder inside the bundle (or empty, meaning next to the page) written with characters that
    /// need no URL encoding; anything else, such as an absolute URL, is left for the host to serve.
    /// </summary>
    private static bool IsLocalFolder(string url) {
        if (("/" + url).Contains("/../") || ("/" + url).Contains("/./") || url.StartsWith("/", StringComparison.Ordinal)) {
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
