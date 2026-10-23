namespace CanopyX.Html.Ui;

/// <summary>Typed stepper layout and navigation metadata. Hosts implement validation and actions through runtime hooks.</summary>
public sealed class CanopyStepperOptions {
    /// <summary>Gets or sets the zero-based current step index.</summary>
    public int SelectedIndex { get; set; }
    /// <summary>Gets or sets interactive, readable report, or header-only static rendering.</summary>
    public CanopyUiMode Mode { get; set; }
    /// <summary>Gets or sets the progress header layout.</summary>
    public CanopyStepperLayout Layout { get; set; }
    /// <summary>Gets or sets whether forward navigation is restricted to visited steps.</summary>
    public bool Linear { get; set; } = true;
    /// <summary>Gets or sets whether interactive markup includes footer action buttons.</summary>
    public bool ShowFooter { get; set; }
    /// <summary>Gets or sets the Back button's plain text label.</summary>
    public string BackLabel { get; set; } = "Back";
    /// <summary>Gets or sets the Next button's plain text label.</summary>
    public string NextLabel { get; set; } = "Next";
    /// <summary>Gets or sets the last step's primary action label.</summary>
    public string FinishLabel { get; set; } = "Finish";
    /// <summary>Gets or sets the Skip button label. Null omits this action; otherwise it appears only on optional steps.</summary>
    public string? SkipLabel { get; set; }
    /// <summary>Gets or sets the Save draft button label. Null omits this action.</summary>
    public string? SaveDraftLabel { get; set; }
    /// <summary>Gets or sets a product styling variant.</summary>
    public string? Variant { get; set; }
}
