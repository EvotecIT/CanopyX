namespace CanopyX.Html.Ui;

/// <summary>Typed gallery options. Viewer callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopyGalleryOptions {
    /// <summary>Gets or sets whether moving past the last item returns to the first.</summary>
    public bool Loop { get; set; }
    /// <summary>Gets or sets whether captions show under the thumbnails. They always show in the viewer. Default true.</summary>
    public bool ShowCaptions { get; set; } = true;
}
