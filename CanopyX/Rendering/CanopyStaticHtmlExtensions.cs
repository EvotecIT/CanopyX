using System;

namespace CanopyX.Rendering;

/// <summary>
/// Writes views as script-free tables with inline styles, named like the page writers (<c>ToHtmlPage</c>): the same output as
/// <see cref="CanopyStaticHtml.Render"/> and <see cref="CanopyStaticHtml.RenderGrid(CanopyDataGridView, CanopyGridPage, CanopyStaticHtmlOptions)"/>.
/// </summary>
public static class CanopyStaticHtmlExtensions {
    /// <summary>Writes the outline of a tree's inline nodes for email, print and Word.</summary>
    /// <param name="view">The tree.</param>
    /// <param name="options">Row and depth limits, caption, overflow note and theme.</param>
    /// <returns>The table markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule.</exception>
    public static string ToStaticHtml(this CanopyTreeView view, CanopyStaticHtmlOptions? options = null) => CanopyStaticHtml.Render(view, options);

    /// <summary>Writes an inline grid's rows, in source order, for email, print and Word.</summary>
    /// <param name="view">The grid; a hosted grid needs its accepted result page, through <see cref="CanopyStaticHtml.RenderGrid(CanopyDataGridView, CanopyGridPage, CanopyStaticHtmlOptions)"/>.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>The table markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid or the grid has a host source.</exception>
    public static string ToStaticHtml(this CanopyDataGridView view, CanopyStaticHtmlOptions? options = null) => CanopyStaticHtml.RenderGrid(view, (CanopyGridPage?)null, options);

    /// <summary>Writes a typed grid's rows, in source order, for email, print and Word.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="grid">The typed grid.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>The table markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="grid"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition is invalid or the grid has a host source.</exception>
    public static string ToStaticHtml<T>(this CanopyDataGridView<T> grid, CanopyStaticHtmlOptions? options = null) =>
        (grid ?? throw new ArgumentNullException(nameof(grid))).View.ToStaticHtml(options);
}
