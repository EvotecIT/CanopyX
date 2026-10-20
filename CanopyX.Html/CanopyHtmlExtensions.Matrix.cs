using System;
using System.IO;
using System.Text;

namespace CanopyX.Html;

/// <summary>Writes matrices as host fragments or complete pages.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>Writes the matrix document in a host element without including the entry point.</summary>
    /// <param name="matrix">The matrix.</param>
    /// <param name="options">Theme, direction, automatic mounting, a nonce, a height, extra parts and the asset mode. With inline assets the fragment carries the matrix part.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>
    /// Include a data-grid or reporting entry point (<see cref="CanopyRuntime.DataGrid"/>) once per page. Without a
    /// <see cref="CanopyHtmlOptions.Height"/> the matrix takes its natural height, and its cells scroll within 80% of the window height.
    /// </remarks>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The matrix is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlFragment(this CanopyMatrix matrix, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(matrix, options ?? new CanopyHtmlOptions());

    /// <summary>Writes a complete page with the data-grid entry point and the matrix part, inline or referenced as external assets.</summary>
    /// <param name="matrix">The matrix.</param>
    /// <param name="options">Theme, title, language, direction, height and asset naming. The title defaults to the matrix label.</param>
    /// <returns>The page markup.</returns>
    /// <remarks>Clicking a cell raises <c>canopyx:matrixCell</c> for the host (docs/matrix.md).</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The matrix is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlPage(this CanopyMatrix matrix, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Page(matrix, options ?? new CanopyHtmlOptions());

    /// <summary>Saves a complete matrix page as UTF-8, creating its directory when needed.</summary>
    /// <param name="matrix">The matrix.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The matrix is invalid.</exception>
    public static void SaveHtmlPage(this CanopyMatrix matrix, string path, CanopyHtmlOptions? options = null) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        if (string.IsNullOrEmpty(path)) throw new ArgumentException("Path is required.", nameof(path));
        var html = matrix.ToHtmlPage(options);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, html, new UTF8Encoding(false));
    }
}