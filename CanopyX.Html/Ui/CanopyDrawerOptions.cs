namespace CanopyX.Html.Ui;

/// <summary>Declarative drawer options. The runtime makes drawers modal on phones.</summary>
public sealed class CanopyDrawerOptions {
    /// <summary>Gets or sets the logical opening edge.</summary>
    public CanopyDrawerSide Side { get; set; } = CanopyDrawerSide.End;
    /// <summary>Gets or sets the token-based size.</summary>
    public CanopyOverlaySize Size { get; set; } = CanopyOverlaySize.Medium;
    /// <summary>Gets or sets forced desktop modality. False keeps desktop non-modal; phones are always modal.</summary>
    public bool Modal { get; set; }
    /// <summary>Gets or sets whether outside-click dismissal is allowed.</summary>
    public bool Dismissible { get; set; } = true;
    /// <summary>Gets or sets the close button label.</summary>
    public string CloseLabel { get; set; } = "Close";
    /// <summary>Gets or sets an existing trigger identity; null generates one from the drawer identity.</summary>
    public string? TriggerId { get; set; }
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
