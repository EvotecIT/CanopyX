namespace CanopyX.Html.Ui;

/// <summary>Builds a declarative drawer with encoded accessibility references and trusted content.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Render a trigger separately or wire an existing control to TriggerId and data-cx-open. No assets or executable code are emitted.</remarks>
public sealed class CanopyDrawer {
    /// <summary>Creates a drawer with a page-unique identity and a plain text title.</summary>
    public CanopyDrawer(string id, string title, CanopyDrawerOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Title = UiHtml.Text(title, nameof(title));
        Options = options ?? new CanopyDrawerOptions();
    }

    /// <summary>Gets the page-unique overlay identity.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text title.</summary>
    public string Title { get; }
    /// <summary>Gets the trigger identity used by data-cx-trigger. Hosts keep it unique on the page.</summary>
    public string TriggerId => UiOverlayHtml.TriggerId(Id, Options.TriggerId);
    /// <summary>Gets or sets the plain text description. Null makes aria-describedby reference the content body.</summary>
    public string? Description { get; set; }
    /// <summary>Gets or sets trusted body HTML, inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string ContentHtml { get; set; } = string.Empty;
    /// <summary>Gets or sets trusted footer HTML, inserted without encoding or sanitization.</summary>
    public string? FooterHtml { get; set; }
    /// <summary>Gets the typed overlay options.</summary>
    public CanopyDrawerOptions Options { get; }

    /// <summary>Renders a separate accessible trigger button with encoded text and declarative open metadata.</summary>
    public string ToTriggerHtmlFragment(string label) => UiOverlayHtml.Trigger(Id, TriggerId, label, "drawer");

    /// <summary>Renders the closed drawer; the host runtime owns opening, dismissal and focus management.</summary>
    public string ToHtmlFragment() {
        var html = UiOverlayHtml.Start("dialog", "drawer", Id, TriggerId, Description, Options.Variant);
        UiHtml.Attribute(html, "data-size", UiOverlayHtml.Size(Options.Size));
        UiHtml.Attribute(html, "data-side", UiHtml.Token(Options.Side));
        UiHtml.Attribute(html, "data-modal", UiHtml.Bool(Options.Modal));
        UiHtml.Attribute(html, "data-phone-modal", "true");
        UiHtml.Attribute(html, "data-dismissible", UiHtml.Bool(Options.Dismissible));
        return UiOverlayHtml.Finish(html, "dialog", "drawer", Id, Title, Description, ContentHtml, FooterHtml, Options.CloseLabel);
    }
}
