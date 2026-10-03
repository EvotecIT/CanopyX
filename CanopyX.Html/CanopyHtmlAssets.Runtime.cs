using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>Gets the browser entry point required to render a view.</summary>
    /// <param name="view">The view whose features and translated labels determine the minimum runtime.</param>
    /// <param name="preferred">The host's preferred runtime when the view needs no interactive features.</param>
    /// <returns>The preferred runtime, upgraded to the interactive entry point when required by the view.</returns>
    /// <remarks>
    /// Fragment hosts use this result with <see cref="GetScript"/> and <see cref="GetStyle"/>.
    /// A page containing several views includes the interactive entry point once if any view requires it.
    /// The interactive entry point includes the standard tree runtime.
    /// </remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="preferred"/> is unknown.</exception>
    public static CanopyRuntime GetRuntime(CanopyView view, CanopyRuntime preferred = CanopyRuntime.TreeGrid) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (preferred != CanopyRuntime.TreeGrid && preferred != CanopyRuntime.InteractiveTreeGrid)
            throw new ArgumentOutOfRangeException(nameof(preferred), preferred, "Unknown browser runtime.");
        if (view.Checkboxes != CanopyCheckboxMode.None || view.DragDrop || view.ContextActions.Count > 0 || view.Labels.RequiresInteractiveRuntime)
            return CanopyRuntime.InteractiveTreeGrid;
        foreach (var column in view.Columns) if (column.Editable) return CanopyRuntime.InteractiveTreeGrid;
        return preferred;
    }
}
