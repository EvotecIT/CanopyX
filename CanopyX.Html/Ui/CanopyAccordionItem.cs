namespace CanopyX.Html.Ui;

/// <summary>An accordion section: its heading and explicitly trusted content.</summary>
public sealed class CanopyAccordionItem {
    /// <summary>Creates a section with an identity unique within its accordion.</summary>
    public CanopyAccordionItem(string id, string label) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
    }

    /// <summary>Gets the local identity; the accordion prefixes generated DOM identities.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text label.</summary>
    public string Label { get; }
    /// <summary>Gets or sets trusted HTML, inserted without encoding or sanitization. Never pass untrusted input. A template element defers the content until the section opens.</summary>
    public string ContentHtml { get; set; } = string.Empty;
    /// <summary>Gets or sets trusted HTML beside the heading, for links and buttons, which a heading button cannot contain. Never pass untrusted input.</summary>
    public string? ActionsHtml { get; set; }
    /// <summary>Gets or sets an encoded icon name for the host's icon renderer, never raw icon markup.</summary>
    public string? Icon { get; set; }
    /// <summary>Gets or sets an encoded badge label.</summary>
    public string? Badge { get; set; }
    /// <summary>Gets or sets whether the section starts open.</summary>
    public bool Open { get; set; }
    /// <summary>Gets or sets whether the reader cannot toggle the section. Its heading stays focusable, and it stays open when <see cref="Open"/> is set.</summary>
    public bool Disabled { get; set; }
    /// <summary>Gets or sets whether the section has a copy-title button. Null follows <see cref="CanopyAccordionOptions.CopyTitle"/>.</summary>
    public bool? CopyTitle { get; set; }
}
