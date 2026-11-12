using System;

namespace CanopyX.Html;

/// <summary>Writes typed grids the way their untyped <see cref="CanopyDataGridView{T}.View"/> is written.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>Writes the typed grid's configuration in a host element without including assets.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="grid">The typed grid.</param>
    /// <param name="options">Theme, height and automatic mounting.</param>
    /// <returns>The fragment markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="grid"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid.</exception>
    public static string ToHtmlFragment<T>(this CanopyDataGridView<T> grid, CanopyHtmlOptions? options = null) => ViewOf(grid).ToHtmlFragment(options);

    /// <summary>Writes the typed grid as a complete page with the data-grid runtime.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="grid">The typed grid.</param>
    /// <param name="options">Theme, title, language, head elements and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="grid"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid.</exception>
    public static string ToHtmlPage<T>(this CanopyDataGridView<T> grid, CanopyHtmlOptions? options = null) => ViewOf(grid).ToHtmlPage(options);

    /// <summary>Saves the typed grid as a complete page, as UTF-8, creating its directory when needed.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="grid">The typed grid.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="grid"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    public static void SaveHtmlPage<T>(this CanopyDataGridView<T> grid, string path, CanopyHtmlOptions? options = null) => ViewOf(grid).SaveHtmlPage(path, options);

    private static CanopyDataGridView ViewOf<T>(CanopyDataGridView<T> grid) => (grid ?? throw new ArgumentNullException(nameof(grid))).View;
}
