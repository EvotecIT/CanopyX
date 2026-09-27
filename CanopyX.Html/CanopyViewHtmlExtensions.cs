using System;
using System.IO;
using System.Text;

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
}
