using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>Gets the entry point that renders a text diff: the data-grid entry point, which loads the changes part on first use.</summary>
    /// <param name="diff">The diff.</param>
    /// <returns><see cref="CanopyRuntime.DataGrid"/>. The reporting entry point renders change views too.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyTextDiff diff) => diff == null ? throw new ArgumentNullException(nameof(diff)) : CanopyRuntime.DataGrid;

    /// <summary>Gets the entry point that renders a change list: the data-grid entry point, which loads the changes part on first use.</summary>
    /// <param name="list">The list.</param>
    /// <returns><see cref="CanopyRuntime.DataGrid"/>. The reporting entry point renders change views too.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyChangeList list) => list == null ? throw new ArgumentNullException(nameof(list)) : CanopyRuntime.DataGrid;

    /// <summary>Gets the entry point that renders a propagation view: the data-grid entry point, which loads the changes part on first use.</summary>
    /// <param name="view">The view.</param>
    /// <returns><see cref="CanopyRuntime.DataGrid"/>. The reporting entry point renders change views too.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyPropagation view) => view == null ? throw new ArgumentNullException(nameof(view)) : CanopyRuntime.DataGrid;

    /// <summary>Gets the parts a text diff loads, whose payloads a single-file page carries: the changes part.</summary>
    /// <param name="diff">The diff.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyTextDiff diff) => diff == null ? throw new ArgumentNullException(nameof(diff)) : GetChangeViewParts();

    /// <summary>Gets the parts a change list loads, whose payloads a single-file page carries: the changes part.</summary>
    /// <param name="list">The list.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyChangeList list) => list == null ? throw new ArgumentNullException(nameof(list)) : GetChangeViewParts();

    /// <summary>Gets the parts a propagation view loads, whose payloads a single-file page carries: the changes part.</summary>
    /// <param name="view">The view.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyPropagation view) => view == null ? throw new ArgumentNullException(nameof(view)) : GetChangeViewParts();

    internal static IReadOnlyList<CanopyHtmlPart> GetChangeViewParts() => WithRequired(Parts.Where(part => part.IsNeededByChangeView));
}
