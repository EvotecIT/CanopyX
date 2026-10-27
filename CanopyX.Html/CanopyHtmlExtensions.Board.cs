using System;
using CanopyX.Rendering;

namespace CanopyX.Html;

public static partial class CanopyHtmlExtensions {
    /// <summary>Renders a board as script-free lanes and cards with inline styles for email, print and Word.</summary>
    /// <param name="view">The grid with a board definition.</param>
    /// <param name="page">An accepted result snapshot, required for hosted sources.</param>
    /// <param name="options">Caption, theme, culture and the maximum number of cards.</param>
    /// <returns>The static board with WIP warnings and partial-result disclosure.</returns>
    /// <exception cref="ArgumentNullException">The view is null.</exception>
    /// <exception cref="InvalidOperationException">The view has no board or the snapshot is invalid.</exception>
    public static string ToBoardStaticHtml(this CanopyDataGridView view, CanopyGridPage? page = null, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (view.Board == null) throw new InvalidOperationException("Static board output requires a board definition.");
        return CanopyStaticHtml.RenderGrid(view, page, options);
    }
}
