using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a thumbnail gallery whose items open in the lightbox viewer (docs/ui-lightbox.md).</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Without the runtime each thumbnail is a link to its item,
/// so a static report still opens every image. This builder emits no assets or executable code.</remarks>
[PowerForge.Fluent.Fluent]
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
        if (Options.Loop) UiHtml.Attribute(html, "data-loop", "true");
        html.Append("><ul class=\"cx-gallery-list\">");
        var templates = new StringBuilder();
        for (var index = 0; index < Items.Count; index++) {
            var item = Items[index] ?? throw new ArgumentException("Items cannot contain null entries.");
            UiHtml.EnumValue(item.Type);
            if (item.Width <= 0 || item.Height <= 0) throw new ArgumentOutOfRangeException(nameof(item.Width), "Thumbnail sizes are positive.");
            var template = Id + "-item-" + UiHtml.Number(index);
            // The link's fragment is percent-encoded; the runtime decodes it back to the template's identity.
            var href = item.Type == CanopyGalleryItemType.Content ? "#" + Uri.EscapeDataString(template) : Address(YouTubeLink(item));
            if (item.Type == CanopyGalleryItemType.Content) {
                if (string.IsNullOrWhiteSpace(item.ContentHtml)) throw new ArgumentException("A content item needs ContentHtml.");
                templates.Append("<template id=\"").Append(UiHtml.Encode(template)).Append("\">").Append(item.ContentHtml).Append("</template>");
            }
            var video = item.Type == CanopyGalleryItemType.Video || item.Type == CanopyGalleryItemType.YouTube;
            if (!video && (item.Poster != null || item.Autoplay)) throw new ArgumentException("Only video items have a poster or autoplay.");
            var poster = item.Poster == null ? null : Address(item.Poster);
            var thumbnail = item.ThumbnailHref != null ? Address(item.ThumbnailHref) : item.Type == CanopyGalleryItemType.Image ? href : poster;
            html.Append("<li class=\"cx-gallery-item\"><figure><a class=\"cx-gallery-link\" data-lightbox-item");
            UiHtml.Attribute(html, "href", href);
            if (item.Type != CanopyGalleryItemType.Image)
                UiHtml.Attribute(html, "data-lightbox-type", item.Type == CanopyGalleryItemType.YouTube ? "youtube" : UiHtml.Token(item.Type));
            if (poster != null) UiHtml.Attribute(html, "data-poster", poster);
            if (item.Autoplay) UiHtml.Attribute(html, "data-autoplay", "true");
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

    // A bare YouTube id becomes its watch address, so the link also works when it opens without the viewer.
    private static string YouTubeLink(CanopyGalleryItem item) {
        if (item.Type != CanopyGalleryItemType.YouTube || item.Href.Length != 11) return item.Href;
        foreach (var c in item.Href) if (!(c is >= 'a' and <= 'z' || c is >= 'A' and <= 'Z' || c is >= '0' and <= '9' || c == '-' || c == '_')) return item.Href;
        return "https://www.youtube.com/watch?v=" + item.Href;
    }

    // Links open their items without the runtime too, so a script address would run on a click.
    private static string Address(string value) {
        // Browsers drop tabs and line breaks inside addresses ("java\tscript:"), so control characters are refused outright.
        foreach (var c in value) if (c < ' ' || c == '\u007f') throw new ArgumentException("A gallery address cannot contain control characters.");
        var scheme = value.TrimStart();
        foreach (var refused in new[] { "javascript:", "vbscript:" })
            if (scheme.StartsWith(refused, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("A gallery address cannot be a script.");
        if (scheme.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && !scheme.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            && !scheme.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("A gallery data address must be an image or a video.");
        return value;
    }
}
