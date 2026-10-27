namespace CanopyX.Html.Ui;

/// <summary>Declarative anchored, non-modal popover options.</summary>
public sealed class CanopyPopoverOptions {
    /// <summary>Gets or sets the preferred placement, subject to runtime viewport fitting.</summary>
    public CanopyOverlayPlacement Placement { get; set; } = CanopyOverlayPlacement.BottomStart;
    /// <summary>Gets or sets an existing trigger identity; null generates one from the popover identity.</summary>
    public string? TriggerId { get; set; }
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
