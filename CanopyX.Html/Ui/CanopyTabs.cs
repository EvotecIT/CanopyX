using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds dependency-free declarative tabs with readable content before runtime readiness.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. This builder emits no assets or executable code.</remarks>
public sealed class CanopyTabs {
    /// <summary>Creates a tab set with a page-unique root identity and an accessible tab list label.</summary>
    public CanopyTabs(string id, string label, CanopyTabsOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopyTabsOptions();
    }

    /// <summary>Gets the root DOM identity. Hosts keep it unique across composed fragments.</summary>
    public string Id { get; }
    /// <summary>Gets the tab list's accessible label.</summary>
    public string Label { get; }
    /// <summary>Gets the tabs in display order.</summary>
    public IList<CanopyTab> Tabs { get; } = new List<CanopyTab>();
    /// <summary>Gets the typed presentation options.</summary>
    public CanopyTabsOptions Options { get; }

    /// <summary>Renders encoded labels and identities with trusted panel HTML. All panels remain visible until data-cx-ready is set by the runtime.</summary>
    /// <exception cref="ArgumentException">Identities collide, a tab is null, or the selected tab is disabled.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The selected index or an option is invalid.</exception>
    public string ToHtmlFragment() {
        UiHtml.Index(Options.SelectedIndex, Tabs.Count);
        UiHtml.EnumValue(Options.Style);
        UiHtml.EnumValue(Options.Overflow);
        UiHtml.EnumValue(Options.Activation);
        if (Options.AutoProgress != null && Options.AutoProgress.Interval <= 0)
            throw new ArgumentOutOfRangeException(nameof(Options.AutoProgress.Interval), "The interval must be positive milliseconds.");
        var style = Options.Style == CanopyTabsStyle.Segmented && Tabs.Count > 5 ? CanopyTabsStyle.Pills : Options.Style;
        if (style == CanopyTabsStyle.Segmented && Tabs.Count < 2)
            throw new ArgumentException("Segmented tabs require at least two tabs.");
        if (Options.Overflow == CanopyTabsOverflow.Wrap && style != CanopyTabsStyle.Pills)
            throw new ArgumentException("Only pills support wrapping.");
        var ids = new HashSet<string>(StringComparer.Ordinal) { Id };
        var localIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tab in Tabs) {
            if (tab == null) throw new ArgumentException("Tabs cannot contain null entries.");
            UiHtml.Unique(localIds, tab.Id);
            UiHtml.Unique(ids, TabId(tab));
            UiHtml.Unique(ids, PanelId(tab));
        }
        if (Tabs[Options.SelectedIndex].Disabled) throw new ArgumentException("The selected tab cannot be disabled.");
        var html = new StringBuilder("<div");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-tabs cx-tabs--").Append(UiHtml.Token(style)).Append("\" data-cx-tabs data-hfx-part=\"tabs\"");
        UiHtml.Attribute(html, "data-hfx-variant", Options.Variant);
        UiHtml.Attribute(html, "data-overflow", UiHtml.Token(Options.Overflow));
        UiHtml.Attribute(html, "data-activation", UiHtml.Token(Options.Activation));
        UiHtml.Attribute(html, "data-collapse", (Options.CollapseToPicker ?? style != CanopyTabsStyle.Segmented) ? "picker" : "none");
        UiHtml.Attribute(html, "data-print", Options.PrintAll ? "all" : "selected");
        if (Options.Justified) UiHtml.Attribute(html, "data-justified", "true");
        UiHtml.Attribute(html, "data-remember", Options.RememberKey);
        if (Options.AutoProgress != null) {
            UiHtml.Attribute(html, "data-auto-progress-interval", UiHtml.Number(Options.AutoProgress.Interval));
            UiHtml.Attribute(html, "data-auto-progress-pause-on-hover", UiHtml.Bool(Options.AutoProgress.PauseOnHover));
            UiHtml.Attribute(html, "data-auto-progress-pause-on-focus", UiHtml.Bool(Options.AutoProgress.PauseOnFocus));
        }
        html.Append("><div class=\"cx-tablist\" role=\"tablist\"");
        UiHtml.Attribute(html, "aria-label", Label);
        UiHtml.Attribute(html, "aria-orientation", style == CanopyTabsStyle.Vertical ? "vertical" : "horizontal");
        html.Append('>');
        for (var i = 0; i < Tabs.Count; i++) {
            var tab = Tabs[i];
            var selected = i == Options.SelectedIndex;
            html.Append("<button type=\"button\" class=\"cx-tab\" role=\"tab\" data-hfx-part=\"tab\"");
            UiHtml.Attribute(html, "id", TabId(tab));
            UiHtml.Attribute(html, "data-tab-id", tab.Id);
            UiHtml.Attribute(html, "aria-controls", PanelId(tab));
            UiHtml.Attribute(html, "aria-selected", UiHtml.Bool(selected));
            UiHtml.Attribute(html, "tabindex", selected ? "0" : "-1");
            if (tab.Disabled) UiHtml.Attribute(html, "aria-disabled", "true");
            UiHtml.Attribute(html, "data-state", tab.Disabled ? "disabled" : selected ? "selected" : null);
            html.Append('>');
            if (tab.Icon != null) {
                html.Append("<span class=\"cx-tab-icon\" aria-hidden=\"true\"");
                UiHtml.Attribute(html, "data-icon", tab.Icon);
                html.Append("></span>");
            }
            UiHtml.Span(html, "cx-tab-label", tab.Label);
            if (tab.Badge != null) {
                html.Append(' ');
                UiHtml.Span(html, "cx-tab-badge", tab.Badge, "badge");
            }
            html.Append("</button>");
        }
        html.Append("</div>");
        foreach (var tab in Tabs) {
            html.Append("<section class=\"cx-tabpanel\" role=\"tabpanel\" data-hfx-part=\"tabpanel\"");
            UiHtml.Attribute(html, "id", PanelId(tab));
            UiHtml.Attribute(html, "aria-labelledby", TabId(tab));
            if (ReferenceEquals(tab, Tabs[Options.SelectedIndex])) UiHtml.Attribute(html, "data-state", "selected");
            if (!tab.HasFocusableContent) UiHtml.Attribute(html, "tabindex", "0");
            html.Append("><h3 class=\"cx-tabpanel-heading\" data-hfx-part=\"title\">").Append(UiHtml.Encode(tab.Label));
            if (tab.Badge != null) {
                html.Append(' ');
                UiHtml.Span(html, "cx-tab-badge", tab.Badge, "badge");
            }
            html.Append("</h3>").Append(tab.ContentHtml).Append("</section>");
        }
        return html.Append("</div>").ToString();
    }

    private string TabId(CanopyTab tab) => Id + "-tab-" + tab.Id;
    private string PanelId(CanopyTab tab) => Id + "-panel-" + tab.Id;
}
