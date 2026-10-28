using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

// Common anatomy for dialog, drawer and popover. The browser runtime owns opening and focus.
internal static class UiOverlayHtml {
    internal static string TriggerId(string id, string? triggerId) => UiHtml.Id(triggerId ?? id + "-trigger", nameof(triggerId));

    internal static void Validate(string id, string triggerId, bool hasDescription) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        UiHtml.Unique(ids, id);
        UiHtml.Unique(ids, triggerId);
        UiHtml.Unique(ids, id + "-title");
        UiHtml.Unique(ids, id + "-body");
        if (hasDescription) UiHtml.Unique(ids, id + "-description");
    }

    internal static string Trigger(string id, string triggerId, string label, string kind) {
        UiHtml.Text(label, nameof(label));
        var ids = new HashSet<string>(StringComparer.Ordinal);
        UiHtml.Unique(ids, id);
        UiHtml.Unique(ids, triggerId);
        var html = new StringBuilder("<button type=\"button\"");
        UiHtml.Attribute(html, "id", triggerId);
        UiHtml.Attribute(html, "data-cx-open", id);
        UiHtml.Attribute(html, "aria-haspopup", kind == "menu" ? "menu" : "dialog");
        UiHtml.Attribute(html, "aria-expanded", "false");
        UiHtml.Attribute(html, "aria-controls", id);
        return html.Append('>').Append(UiHtml.Encode(label)).Append("</button>").ToString();
    }

    internal static StringBuilder Start(string tag, string kind, string id, string triggerId, string? description,
        string? variant, bool alert = false) {
        Validate(id, triggerId, description != null);
        var html = new StringBuilder("<" + tag);
        UiHtml.Attribute(html, "id", id);
        UiHtml.Attribute(html, "class", "cx-" + kind);
        UiHtml.Attribute(html, "data-cx-" + kind, string.Empty);
        UiHtml.Attribute(html, "data-hfx-part", kind);
        UiHtml.Attribute(html, "data-hfx-variant", variant);
        UiHtml.Attribute(html, "data-state", "closed");
        UiHtml.Attribute(html, "data-cx-trigger", triggerId);
        UiHtml.Attribute(html, "role", alert ? "alertdialog" : "dialog");
        UiHtml.Attribute(html, "aria-labelledby", id + "-title");
        UiHtml.Attribute(html, "aria-describedby", id + (description == null ? "-body" : "-description"));
        return html;
    }

    internal static string Finish(StringBuilder html, string tag, string kind, string id, string title,
        string? description, string contentHtml, string? footerHtml, string? closeLabel) {
        html.Append("><header class=\"cx-").Append(kind).Append("-header\" data-hfx-part=\"header\"><h2 data-hfx-part=\"title\"");
        UiHtml.Attribute(html, "id", id + "-title");
        html.Append('>').Append(UiHtml.Encode(title)).Append("</h2>");
        if (closeLabel != null) {
            UiHtml.Text(closeLabel, nameof(closeLabel));
            html.Append("<button type=\"button\" class=\"cx-overlay-close\"");
            UiHtml.Attribute(html, "data-cx-close", id);
            UiHtml.Attribute(html, "aria-label", closeLabel);
            html.Append('>').Append(UiHtml.Encode(closeLabel)).Append("</button>");
        }
        html.Append("</header><div class=\"cx-").Append(kind).Append("-body\" data-hfx-part=\"body\"");
        UiHtml.Attribute(html, "id", id + "-body");
        html.Append('>');
        if (description != null) {
            html.Append("<p");
            UiHtml.Attribute(html, "id", id + "-description");
            html.Append('>').Append(UiHtml.Encode(description)).Append("</p>");
        }
        html.Append(contentHtml).Append("</div>");
        if (footerHtml != null) html.Append("<footer class=\"cx-").Append(kind)
            .Append("-footer\" data-hfx-part=\"footer\">").Append(footerHtml).Append("</footer>");
        return html.Append("</").Append(tag).Append('>').ToString();
    }

    internal static string Size(CanopyOverlaySize size) {
        UiHtml.EnumValue(size);
        return size == CanopyOverlaySize.Small ? "sm" : size == CanopyOverlaySize.Large ? "lg" : "md";
    }
}
