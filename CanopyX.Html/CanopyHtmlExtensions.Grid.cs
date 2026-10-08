using System;
using System.IO;
using System.Text;

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
}
