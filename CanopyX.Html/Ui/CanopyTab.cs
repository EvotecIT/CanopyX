namespace CanopyX.Html.Ui;

/// <summary>A tab label and its explicitly trusted panel HTML.</summary>
public sealed class CanopyTab {
    /// <summary>Creates a tab with an identity unique within its tab set.</summary>
    public CanopyTab(string id, string label) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
    }

    /// <summary>Gets the local identity; the tab set prefixes generated DOM identities.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text label.</summary>
    public string Label { get; }
    /// <summary>Gets or sets trusted HTML, inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string ContentHtml { get; set; } = string.Empty;
    /// <summary>Gets or sets an encoded icon name for the host's icon renderer, never raw icon markup.</summary>
    public string? Icon { get; set; }
    /// <summary>Gets or sets an encoded badge label.</summary>
    public string? Badge { get; set; }
    /// <summary>Gets or sets whether activation is blocked. Disabled tabs remain focusable by the runtime.</summary>
    public bool Disabled { get; set; }
    /// <summary>Gets or sets whether panel content already contains a focusable element, avoiding a redundant tab stop.</summary>
    public bool HasFocusableContent { get; set; }
}
