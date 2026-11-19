namespace CanopyX.Html.Ui;

/// <summary>A gallery item: the link a reader follows, its thumbnail and its caption.</summary>
public sealed class CanopyGalleryItem {
    /// <summary>Creates an item with the address it opens and the text that names it for readers who do not see it.</summary>
    /// <param name="href">The full image, page or document. A relative address, a web address or a data URI; script addresses are refused.</param>
    /// <param name="alt">The alternative text of the item and its thumbnail.</param>
    public CanopyGalleryItem(string href, string alt) {
        Href = UiHtml.Text(href, nameof(href));
        Alt = UiHtml.Text(alt, nameof(alt));
    }

    /// <summary>Gets the address the item opens. For <see cref="CanopyGalleryItemType.Content"/> it is ignored.</summary>
    public string Href { get; }
    /// <summary>Gets the alternative text.</summary>
    public string Alt { get; }
    /// <summary>Gets or sets what the item opens.</summary>
    public CanopyGalleryItemType Type { get; set; }
    /// <summary>Gets or sets the thumbnail address. Null uses <see cref="Href"/> for an image and a text link for other items.</summary>
    public string? ThumbnailHref { get; set; }
    /// <summary>Gets or sets the plain text caption under the thumbnail and in the viewer.</summary>
    public string? Caption { get; set; }
    /// <summary>Gets or sets trusted HTML a content item shows, inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string? ContentHtml { get; set; }
    /// <summary>Gets or sets the thumbnail's intrinsic width in pixels, which reserves its space before it loads.</summary>
    public int? Width { get; set; }
    /// <summary>Gets or sets the thumbnail's intrinsic height in pixels.</summary>
    public int? Height { get; set; }
}
