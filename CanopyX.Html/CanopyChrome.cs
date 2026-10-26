namespace CanopyX.Html;

/// <summary>
/// How a fragment frames itself (<see cref="CanopyHtmlOptions.Chrome"/>).
/// </summary>
public enum CanopyChrome {
    /// <summary>The view draws its own frame: border, radius and surface. Use it when the view stands on its own on a page.</summary>
    Standalone = 0,

    /// <summary>
    /// The view is the content of a surface the host already frames, such as a card body: no outer border or radius, the host's
    /// surface shows through, and the toolbar and header are inset by the host's <c>--hfx-card-padding-x</c> role. Writes
    /// <c>data-cx-chrome="embedded"</c> on the host element; a host that mounts views itself can set that attribute instead.
    /// </summary>
    Embedded
}
