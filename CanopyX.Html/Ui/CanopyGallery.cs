using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a thumbnail gallery whose items open in the lightbox viewer (docs/ui-lightbox.md).</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Without the runtime each thumbnail is a link to its item,
/// so a static report still opens every image. This builder emits no assets or executable code.</remarks>
public sealed class CanopyGallery {
    /// <summary>Creates a gallery with a page-unique identity.</summary>
    public CanopyGallery(string id, CanopyGalleryOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Options = options ?? new CanopyGalleryOptions();
    }

    /// <summary>Gets the root DOM identity. Content items use it as the prefix of their template identities.</summary>
    public string Id { get; }
    /// <summary>Gets the items in display order.</summary>
    public IList<CanopyGalleryItem> Items { get; } = new List<CanopyGalleryItem>();
    /// <summary>Gets the typed options.</summary>
    public CanopyGalleryOptions Options { get; }

    /// <summary>Renders the gallery with encoded addresses and text, and trusted content templates.</summary>
    /// <exception cref="ArgumentException">There are no items, an item is null, an address is a script, or a content item has no content.</exception>
    public string ToHtmlFragment() {
        if (Items.Count == 0) throw new ArgumentException("A gallery requires at least one item.");
        var html = new StringBuilder("<div");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-gallery\" data-cx-lightbox data-cx-part=\"gallery\"");
        UiHtml.Attribute(html, "data-cx-variant", Options.Variant);
        if (Options.Loop) UiHtml.Attribute(html, "data-loop", "true");
        html.Append("><ul class=\"cx-gallery-list\">");
        var templates = new StringBuilder();
        for (var index = 0; index < Items.Count; index++) {
            var item = Items[index] ?? throw new ArgumentException("Items cannot contain null entries.");
            UiHtml.EnumValue(item.Type);
            if (item.Width <= 0 || item.Height <= 0) throw new ArgumentOutOfRangeException(nameof(item.Width), "Thumbnail sizes are positive.");
            var href = item.Type == CanopyGalleryItemType.Content ? "#" + Id + "-item-" + UiHtml.Number(index) : Address(item.Href);
            if (item.Type == CanopyGalleryItemType.Content) {
                if (string.IsNullOrWhiteSpace(item.ContentHtml)) throw new ArgumentException("A content item needs ContentHtml.");
                templates.Append("<template id=\"").Append(UiHtml.Encode(href.Substring(1))).Append("\">").Append(item.ContentHtml).Append("</template>");
            }
            var thumbnail = item.ThumbnailHref != null ? Address(item.ThumbnailHref) : item.Type == CanopyGalleryItemType.Image ? href : null;
            html.Append("<li class=\"cx-gallery-item\"><figure><a class=\"cx-gallery-link\" data-lightbox-item");
            UiHtml.Attribute(html, "href", href);
            if (item.Type != CanopyGalleryItemType.Image) UiHtml.Attribute(html, "data-lightbox-type", UiHtml.Token(item.Type));
            if (item.Caption != null) UiHtml.Attribute(html, "data-caption", item.Caption);
            html.Append('>');
            if (thumbnail == null) html.Append("<span class=\"cx-gallery-label\">").Append(UiHtml.Encode(item.Alt)).Append("</span>");
            else {
                html.Append("<img loading=\"lazy\" decoding=\"async\"");
                UiHtml.Attribute(html, "src", thumbnail);
                UiHtml.Attribute(html, "alt", item.Alt);
                if (item.Width != null) UiHtml.Attribute(html, "width", UiHtml.Number(item.Width.Value));
                if (item.Height != null) UiHtml.Attribute(html, "height", UiHtml.Number(item.Height.Value));
                html.Append('>');
            }
            html.Append("</a>");
            if (Options.ShowCaptions && item.Caption != null) html.Append("<figcaption>").Append(UiHtml.Encode(item.Caption)).Append("</figcaption>");
            html.Append("</figure></li>");
        }
        return html.Append("</ul>").Append(templates).Append("</div>").ToString();
    }

    // Links open their items without the runtime too, so a script address would run on a click.
    private static string Address(string value) {
        var scheme = value.TrimStart();
        foreach (var refused in new[] { "javascript:", "vbscript:" })
            if (scheme.StartsWith(refused, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("A gallery address cannot be a script.");
        if (scheme.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && !scheme.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("A gallery data address must be an image.");
        return value;
    }
}
