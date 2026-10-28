namespace CanopyX.Html.Ui;

/// <summary>Declarative native dialog options.</summary>
public sealed class CanopyDialogOptions {
    /// <summary>Gets or sets the token-based size.</summary>
    public CanopyOverlaySize Size { get; set; } = CanopyOverlaySize.Medium;
    /// <summary>Gets or sets whether this dialog is a confirmation requiring an answer, rendered with role alertdialog.</summary>
    public bool Alert { get; set; }
    /// <summary>Gets or sets scrim dismissal. Null defaults to false for alert dialogs and true otherwise.</summary>
    public bool? Dismissible { get; set; }
    /// <summary>Gets or sets the close button label. Alert dialogs always omit this button.</summary>
    public string CloseLabel { get; set; } = "Close";
    /// <summary>Gets or sets an existing trigger identity; null uses the dialog identity followed by -trigger.</summary>
    public string? TriggerId { get; set; }
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
