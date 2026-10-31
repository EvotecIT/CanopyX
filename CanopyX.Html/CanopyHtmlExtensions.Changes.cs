using System;
using System.IO;
using System.Text;

namespace CanopyX.Html;

/// <summary>Writes the change views (text diffs, change lists and propagation views) as host fragments or complete pages.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>Writes the diff document in a host element without including the entry point.</summary>
    /// <param name="diff">The diff.</param>
    /// <param name="options">Theme, direction, automatic mounting, a nonce, a height bound, extra parts and the asset mode. With inline assets the fragment carries the changes part.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include a data-grid or reporting entry point (<see cref="CanopyRuntime.DataGrid"/>) once per page. The host is as tall as the diff unless <see cref="CanopyHtmlOptions.Height"/> bounds it.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The diff is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlFragment(this CanopyTextDiff diff, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangeFragment((diff ?? throw new ArgumentNullException(nameof(diff))).ToJson(), diff.Id, options ?? new CanopyHtmlOptions());

    /// <summary>Writes a complete page with the data-grid entry point and the changes part, inline or referenced as external assets.</summary>
    /// <param name="diff">The diff.</param>
    /// <param name="options">Theme, title (the diff label by default), language, direction, height and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The diff is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlPage(this CanopyTextDiff diff, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangePage((diff ?? throw new ArgumentNullException(nameof(diff))).ToJson(), diff.Id, diff.Label, options ?? new CanopyHtmlOptions());

    /// <summary>Saves a complete diff page as UTF-8, creating its directory when needed.</summary>
    /// <param name="diff">The diff.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="diff"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The diff is invalid.</exception>
    public static void SaveHtmlPage(this CanopyTextDiff diff, string path, CanopyHtmlOptions? options = null) => Save(diff.ToHtmlPage(options), path);

    /// <summary>Writes the change list document in a host element without including the entry point.</summary>
    /// <param name="list">The list.</param>
    /// <param name="options">Theme, direction, automatic mounting, a nonce, a height bound, extra parts and the asset mode. With inline assets the fragment carries the changes part.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include a data-grid or reporting entry point (<see cref="CanopyRuntime.DataGrid"/>) once per page. Actions raise <c>canopyx:changeAction</c> for the host.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The list is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlFragment(this CanopyChangeList list, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangeFragment((list ?? throw new ArgumentNullException(nameof(list))).ToJson(), list.Id, options ?? new CanopyHtmlOptions());

    /// <summary>Writes a complete page with the data-grid entry point and the changes part, inline or referenced as external assets.</summary>
    /// <param name="list">The list.</param>
    /// <param name="options">Theme, title (the list label by default), language, direction, height and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The list is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlPage(this CanopyChangeList list, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangePage((list ?? throw new ArgumentNullException(nameof(list))).ToJson(), list.Id, list.Label, options ?? new CanopyHtmlOptions());

    /// <summary>Saves a complete change list page as UTF-8, creating its directory when needed.</summary>
    /// <param name="list">The list.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="list"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The list is invalid.</exception>
    public static void SaveHtmlPage(this CanopyChangeList list, string path, CanopyHtmlOptions? options = null) => Save(list.ToHtmlPage(options), path);

    /// <summary>Writes the propagation document in a host element without including the entry point.</summary>
    /// <param name="view">The propagation view.</param>
    /// <param name="options">Theme, direction, automatic mounting, a nonce, a height bound, extra parts and the asset mode. With inline assets the fragment carries the changes part.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include a data-grid or reporting entry point (<see cref="CanopyRuntime.DataGrid"/>) once per page.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlFragment(this CanopyPropagation view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangeFragment((view ?? throw new ArgumentNullException(nameof(view))).ToJson(), view.Id, options ?? new CanopyHtmlOptions(), CanopyHtmlAssets.GetRequiredParts(view));

    /// <summary>Writes a complete page with the data-grid entry point and the changes part, inline or referenced as external assets.</summary>
    /// <param name="view">The propagation view.</param>
    /// <param name="options">Theme, title (the view label by default), language, direction, height and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view is invalid, tree filter IDs are specified, or a requested part does not ship with the data-grid entry point.</exception>
    public static string ToHtmlPage(this CanopyPropagation view, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.ChangePage((view ?? throw new ArgumentNullException(nameof(view))).ToJson(), view.Id, view.Label, options ?? new CanopyHtmlOptions(), CanopyHtmlAssets.GetRequiredParts(view));

    /// <summary>Saves a complete propagation page as UTF-8, creating its directory when needed.</summary>
    /// <param name="view">The propagation view.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The view is invalid.</exception>
    public static void SaveHtmlPage(this CanopyPropagation view, string path, CanopyHtmlOptions? options = null) => Save(view.ToHtmlPage(options), path);

    private static void Save(string html, string path) {
        if (string.IsNullOrEmpty(path)) throw new ArgumentException("Path is required.", nameof(path));
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, html, new UTF8Encoding(false));
    }
}
