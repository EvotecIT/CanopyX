namespace CanopyX.Html.Ui;

/// <summary>Typed declarative tab options. Runtime callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopyTabsOptions {
    /// <summary>Gets or sets the zero-based selected tab index.</summary>
    public int SelectedIndex { get; set; }
    /// <summary>Gets or sets the visual selection treatment.</summary>
    public CanopyTabsStyle Style { get; set; }
    /// <summary>Gets or sets the overflow treatment. Wrap is supported only for pills.</summary>
    public CanopyTabsOverflow Overflow { get; set; }
    /// <summary>Gets or sets the keyboard activation policy. Auto lets the runtime account for deferred panels and host guards.</summary>
    public CanopyTabActivation Activation { get; set; } = CanopyTabActivation.Auto;
    /// <summary>Gets or sets automatic progression settings. Null leaves progression disabled.</summary>
    public CanopyTabsAutoProgress? AutoProgress { get; set; }
    /// <summary>Gets or sets whether narrow containers use the shared picker. Null selects the style default.</summary>
    public bool? CollapseToPicker { get; set; }
    /// <summary>Gets or sets whether all panels print, rather than only the selected panel.</summary>
    public bool PrintAll { get; set; } = true;
    /// <summary>Gets or sets whether horizontal tabs share the full width equally.</summary>
    public bool Justified { get; set; }
    /// <summary>Gets or sets the browser storage key that remembers the selected tab across visits. Null remembers nothing.</summary>
    public string? RememberKey { get; set; }
    /// <summary>Gets or sets the product styling variant emitted as an encoded attribute.</summary>
    public string? Variant { get; set; }
}
