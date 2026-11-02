using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a dependency-free declarative accordion whose sections stay readable before runtime readiness.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. This builder emits no assets or executable code.</remarks>
public sealed class CanopyAccordion {
    // The ARIA accordion pattern advises against region landmarks when many panels can be open together.
    private const int MaxRegions = 6;

    /// <summary>Creates an accordion with a page-unique root identity.</summary>
    public CanopyAccordion(string id, CanopyAccordionOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Options = options ?? new CanopyAccordionOptions();
    }

    /// <summary>Gets the root DOM identity. Hosts keep it unique across composed fragments.</summary>
    public string Id { get; }
    /// <summary>Gets the sections in display order.</summary>
    public IList<CanopyAccordionItem> Items { get; } = new List<CanopyAccordionItem>();
    /// <summary>Gets the typed presentation options.</summary>
    public CanopyAccordionOptions Options { get; }

    /// <summary>Renders encoded labels and identities with trusted section HTML. All sections remain visible until data-cx-ready is set by the runtime.</summary>
    /// <exception cref="ArgumentException">There are no sections, identities collide, a section is null, or a single-open accordion starts with several open sections.</exception>
    /// <exception cref="ArgumentOutOfRangeException">An option is invalid.</exception>
    public string ToHtmlFragment() {
        if (Items.Count == 0) throw new ArgumentException("An accordion requires at least one section.");
        UiHtml.EnumValue(Options.Style);
        UiHtml.EnumValue(Options.Indicator);
        UiHtml.EnumValue(Options.IndicatorPosition);
        if (Options.HeadingLevel < 2 || Options.HeadingLevel > 6)
            throw new ArgumentOutOfRangeException(nameof(Options.HeadingLevel), "Section headings use levels 2 to 6.");
        if (Options.SearchDebounce < 0)
            throw new ArgumentOutOfRangeException(nameof(Options.SearchDebounce), "The delay cannot be negative.");
        var ids = new HashSet<string>(StringComparer.Ordinal) { Id };
        var localIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in Items) {
            if (item == null) throw new ArgumentException("Items cannot contain null entries.");
            UiHtml.Unique(localIds, item.Id);
            UiHtml.Unique(ids, TriggerId(item));
            UiHtml.Unique(ids, PanelId(item));
        }
        if (!Options.Multiple && Items.Count(item => item.Open) > 1)
            throw new ArgumentException("A single-open accordion can start with one open section.");
        var html = new StringBuilder("<div");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-accordion cx-accordion--").Append(UiHtml.Token(Options.Style)).Append("\" data-cx-accordion data-hfx-part=\"accordion\"");
        UiHtml.Attribute(html, "data-hfx-variant", Options.Variant);
        UiHtml.Attribute(html, "data-multiple", UiHtml.Bool(Options.Multiple));
        UiHtml.Attribute(html, "data-indicator", UiHtml.Token(Options.Indicator));
        UiHtml.Attribute(html, "data-indicator-position", UiHtml.Token(Options.IndicatorPosition));
        UiHtml.Attribute(html, "data-print", Options.PrintAll ? "all" : "selected");
        if (Options.Animate) UiHtml.Attribute(html, "data-transition", "slide");
        if (Options.Hash) UiHtml.Attribute(html, "data-hash", "true");
        UiHtml.Attribute(html, "data-remember", Options.RememberKey);
        if (Options.Search) UiHtml.Attribute(html, "data-search", "true");
        UiHtml.Attribute(html, "data-search-placeholder", Options.SearchPlaceholder);
        if (Options.SearchDebounce != null) UiHtml.Attribute(html, "data-search-debounce", UiHtml.Number(Options.SearchDebounce.Value));
        html.Append('>');
        foreach (var item in Items) Section(html, item);
        return html.Append("</div>").ToString();
    }

    private void Section(StringBuilder html, CanopyAccordionItem item) {
        html.Append("<section class=\"cx-accordion-item\" data-hfx-part=\"accordion-item\"");
        UiHtml.Attribute(html, "data-state", item.Disabled ? "disabled" : item.Open ? "open" : null);
        if (item.CopyTitle ?? Options.CopyTitle) UiHtml.Attribute(html, "data-copy-title", "true");
        html.Append("><div class=\"cx-accordion-header\" data-hfx-part=\"header\"><h").Append(Options.HeadingLevel).Append(" class=\"cx-accordion-heading\" data-hfx-part=\"title\">");
        html.Append("<button type=\"button\" class=\"cx-accordion-trigger\" data-hfx-part=\"trigger\"");
        UiHtml.Attribute(html, "id", TriggerId(item));
        UiHtml.Attribute(html, "data-accordion-id", item.Id);
        UiHtml.Attribute(html, "aria-controls", PanelId(item));
        UiHtml.Attribute(html, "aria-expanded", UiHtml.Bool(item.Open));
        if (item.Disabled) UiHtml.Attribute(html, "aria-disabled", "true");
        html.Append('>');
        if (item.Icon != null) {
            html.Append("<span class=\"cx-accordion-icon\" aria-hidden=\"true\"");
            UiHtml.Attribute(html, "data-icon", item.Icon);
            html.Append("></span>");
        }
        UiHtml.Span(html, "cx-accordion-label", item.Label);
        if (item.Badge != null) UiHtml.Span(html, "cx-accordion-badge", item.Badge, "badge");
        html.Append("<span class=\"cx-accordion-indicator\" aria-hidden=\"true\"></span></button></h").Append(Options.HeadingLevel).Append('>');
        if (item.ActionsHtml != null) html.Append("<div class=\"cx-accordion-actions\" data-hfx-part=\"actions\">").Append(item.ActionsHtml).Append("</div>");
        html.Append("</div><div class=\"cx-accordion-panel\" data-hfx-part=\"panel\"");
        UiHtml.Attribute(html, "id", PanelId(item));
        if (Items.Count <= MaxRegions) UiHtml.Attribute(html, "role", "region");
        UiHtml.Attribute(html, "aria-labelledby", TriggerId(item));
        html.Append('>').Append(item.ContentHtml).Append("</div></section>");
    }

    private string TriggerId(CanopyAccordionItem item) => Id + "-trigger-" + item.Id;
    private string PanelId(CanopyAccordionItem item) => Id + "-panel-" + item.Id;
}
