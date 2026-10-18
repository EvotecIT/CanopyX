using System;
using System.IO;
using System.Text;
using CanopyX.Bundles;

namespace CanopyX.Html;

/// <summary>Writes flat-grid definitions as host fragments or complete pages.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>Writes the grid configuration in a host element without including assets.</summary>
    /// <param name="view">The grid definition.</param>
    /// <param name="options">Theme, height and automatic mounting.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include the data-grid runtime once per page. It also hosts existing interactive trees.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid or tree filter IDs are specified.</exception>
    public static string ToHtmlFragment(this CanopyDataGridView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(view, options ?? new CanopyHtmlOptions());

    /// <summary>Writes a complete page with the data-grid runtime, inline or referenced as external assets.</summary>
    /// <param name="view">The grid definition.</param>
    /// <param name="options">Theme, title, language and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <remarks>A host source needs a configured query callback before the fragment mounts; a definition contains no transport or credentials.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid or tree filter IDs are specified.</exception>
    public static string ToHtmlPage(this CanopyDataGridView view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Page(view, options ?? new CanopyHtmlOptions());

    /// <summary>Saves a complete grid page as UTF-8, creating its directory when needed.</summary>
    /// <param name="view">The grid definition.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <remarks>External assets are written separately with <see cref="CanopyHtmlAssets.WriteTo(string, CanopyAssetNaming, CanopyRuntime)"/> and the data-grid runtime.</remarks>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    public static void SaveHtmlPage(this CanopyDataGridView view, string path, CanopyHtmlOptions? options = null) {
        if (string.IsNullOrEmpty(path)) throw new ArgumentException("Path is required.", nameof(path));
        var html = view.ToHtmlPage(options);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, html, new UTF8Encoding(false));
    }

    /// <summary>
    /// Saves an inline grid as a bundle: its rows as compact row data in sidecar files (<see cref="CanopyGridRowData.WriteFiles"/>),
    /// the runtime assets, and an <c>index.html</c> page that loads the data after its first paint, also when opened from a
    /// file share. The page stays small however many rows the grid has, and the rows load one chunk at a time.
    /// </summary>
    /// <remarks>
    /// Without <paramref name="options"/>, the page references the data-grid runtime and its parts under <c>assets/</c> by their
    /// content-hashed names and they are written next to it; with options, their asset mode applies, and assets are written
    /// when the base URL is a relative folder inside <paramref name="directory"/>. <see cref="CanopyHtmlOptions.RowData"/> sets
    /// the chunk size and the format: <see cref="CanopyRowFormat.Compact"/> or <see cref="CanopyRowFormat.CompactGzip"/>, or
    /// by default <see cref="CanopyRowFormat.Auto"/>, which compresses rows whose JSON comes to more than
    /// <see cref="CanopyRowDataOptions.GzipAboveBytes"/> (default: chunks of 5,000 rows). Republish the page and its data together,
    /// into a folder of their own.
    /// </remarks>
    /// <param name="view">The grid. Its source must be inline.</param>
    /// <param name="directory">The folder for the page, the <c>assets</c> folder, and the data folder.</param>
    /// <param name="options">Page options; defaults to external assets under <c>assets/</c>.</param>
    /// <returns>The data folder and the sizes of the data files, for checking against budgets.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty, or the asset folder is not portable.</exception>
    /// <exception cref="InvalidOperationException">The grid has a host source or an invalid definition, a row carries a detail
    /// payload or record fields (which compact rows have no place for), or the options ask for <see cref="CanopyRowFormat.Objects"/>,
    /// which a bundle cannot write.</exception>
    public static CanopyGridBundleResult SaveHtmlBundle(this CanopyDataGridView view, string directory, CanopyHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (string.IsNullOrEmpty(directory)) throw new ArgumentException("Directory is required.", nameof(directory));
        if (view.Source.Kind != CanopyGridSourceKind.Inline) throw new InvalidOperationException("A grid bundle carries the rows of an inline grid; a hosted grid gets its rows from its host.");
        var pageOptions = options ?? new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External };
        var runtime = CanopyHtmlAssets.GetRuntime(view);
        var assetFolder = LocalAssetFolder(pageOptions);
        if (pageOptions.RowData?.Format == CanopyRowFormat.Objects) throw new InvalidOperationException("A grid bundle writes its rows as compact row data files; CanopyRowFormat.Objects does not apply.");
        var data = new CanopyGridRowData(view, pageOptions.RowData);
        ValidateBundleLayout(data.DataFolder, assetFolder, runtime);
        var result = data.WriteFiles(directory);
        if (assetFolder != null) {
            var assets = assetFolder.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar);
            CanopyHtmlAssets.WriteTo(assets.Length == 0 ? directory : Path.Combine(directory, assets), pageOptions.AssetNaming, runtime);
        }

        var page = CanopyHtmlWriter.Page(view, pageOptions, data, result.Base);
        File.WriteAllText(Path.Combine(directory, "index.html"), page, new UTF8Encoding(false));
        return result;
    }
}
