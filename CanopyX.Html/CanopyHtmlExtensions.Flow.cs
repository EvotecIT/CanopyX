using System;
using System.IO;
using System.Text;

namespace CanopyX.Html;

/// <summary>Writes flows as host fragments or complete pages.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>Writes the flow document in a host element without including the entry point.</summary>
    /// <param name="flow">The flow.</param>
    /// <param name="options">Theme, direction, automatic mounting, a nonce, an optional height, extra parts and the asset mode. With inline assets the fragment carries the forms and flow parts.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include the flow entry point (<see cref="CanopyRuntime.Flow"/>) or a data-grid entry point once per page. The host has no fixed height unless <see cref="CanopyHtmlOptions.Height"/> sets one.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is invalid, tree filter IDs are specified, or a requested part does not ship with the flow entry point.</exception>
    public static string ToHtmlFragment(this CanopyFlow flow, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(flow, options ?? new CanopyHtmlOptions());

    /// <summary>Writes a complete page with the flow entry point, inline or referenced as external assets.</summary>
    /// <param name="flow">The flow.</param>
    /// <param name="options">Theme, title, language, direction and asset naming. The title defaults to the flow's title.</param>
    /// <returns>The page markup.</returns>
    /// <remarks>The page loads no grid code. The host answers the proposal through the <c>canopyx:flowSubmit</c> event (docs/flow.md).</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The flow is invalid, tree filter IDs are specified, or a requested part does not ship with the flow entry point.</exception>
    public static string ToHtmlPage(this CanopyFlow flow, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Page(flow, options ?? new CanopyHtmlOptions());

    /// <summary>Saves a complete flow page as UTF-8, creating its directory when needed.</summary>
    /// <param name="flow">The flow.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <remarks>External assets are written separately with <see cref="CanopyHtmlAssets.WriteTo(string, CanopyAssetNaming, CanopyRuntime)"/> and <see cref="CanopyRuntime.Flow"/>.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The flow is invalid.</exception>
    public static void SaveHtmlPage(this CanopyFlow flow, string path, CanopyHtmlOptions? options = null) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (string.IsNullOrEmpty(path)) throw new ArgumentException("Path is required.", nameof(path));
        var html = flow.ToHtmlPage(options);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, html, new UTF8Encoding(false));
    }
}