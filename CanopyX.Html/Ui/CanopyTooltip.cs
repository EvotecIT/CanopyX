using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a non-interactive plain text tooltip and a separately rendered, independently labelled trigger.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Existing triggers need aria-describedby referencing Id and an identity matching TriggerId.</remarks>
public sealed class CanopyTooltip {
    /// <summary>Creates a tooltip with a page-unique identity and plain text content.</summary>
    public CanopyTooltip(string id, string text, CanopyTooltipOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Text = UiHtml.Text(text, nameof(text));
        Options = options ?? new CanopyTooltipOptions();
    }

    /// <summary>Gets the tooltip identity.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text content; interactive HTML is not supported in tooltips.</summary>
    public string Text { get; }
    /// <summary>Gets the associated trigger identity.</summary>
    public string TriggerId => UiOverlayHtml.TriggerId(Id, Options.TriggerId);
    /// <summary>Gets the typed tooltip options.</summary>
    public CanopyTooltipOptions Options { get; }

    /// <summary>Renders a labelled trigger button. The tooltip supplements, rather than replaces, its accessible name.</summary>
    public string ToTriggerHtmlFragment(string label) {
        Validate();
        UiHtml.Text(label, nameof(label));
        var html = new StringBuilder("<button type=\"button\"");
        UiHtml.Attribute(html, "id", TriggerId);
        UiHtml.Attribute(html, "aria-describedby", Id);
        return html.Append('>').Append(UiHtml.Encode(label)).Append("</button>").ToString();
    }

    /// <summary>Renders an initially hidden tooltip with encoded content and placement metadata.</summary>
    public string ToHtmlFragment() {
        Validate();
        var html = new StringBuilder("<div class=\"cx-tooltip\" role=\"tooltip\" data-cx-tooltip data-hfx-part=\"tooltip\" data-state=\"closed\" hidden");
        UiHtml.Attribute(html, "id", Id);
        UiHtml.Attribute(html, "data-cx-trigger", TriggerId);
        UiHtml.Attribute(html, "data-placement", UiHtml.Token(Options.Placement));
        UiHtml.Attribute(html, "data-hfx-variant", Options.Variant);
        return html.Append('>').Append(UiHtml.Encode(Text)).Append("</div>").ToString();
    }

    private void Validate() {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        UiHtml.Unique(ids, Id);
        UiHtml.Unique(ids, TriggerId);
        UiHtml.EnumValue(Options.Placement);
    }
}
