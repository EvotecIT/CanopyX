namespace CanopyX.Html.Ui;

/// <summary>Declarative menu placement and host styling options.</summary>
public sealed class CanopyMenuOptions {
    /// <summary>Gets or sets an existing trigger identity; null generates one from the menu identity.</summary>
    public string? TriggerId { get; set; }
    /// <summary>Gets or sets the preferred placement.</summary>
    public CanopyOverlayPlacement Placement { get; set; } = CanopyOverlayPlacement.BottomStart;
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
