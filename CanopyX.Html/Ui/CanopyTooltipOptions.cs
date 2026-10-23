namespace CanopyX.Html.Ui;

/// <summary>Declarative tooltip options; tooltip content is always plain text.</summary>
public sealed class CanopyTooltipOptions {
    /// <summary>Gets or sets the preferred placement.</summary>
    public CanopyOverlayPlacement Placement { get; set; } = CanopyOverlayPlacement.Top;
    /// <summary>Gets or sets an existing trigger identity; null generates one from the tooltip identity.</summary>
    public string? TriggerId { get; set; }
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
