namespace CanopyX.Html.Ui;

/// <summary>An option of a <see cref="CanopySelect"/>: its value, its label and what shows beside the label.</summary>
public sealed class CanopySelectOption {
    /// <summary>Creates an option with the value a form submits and the label the reader sees.</summary>
    public CanopySelectOption(string value, string label) {
        Value = value ?? throw new System.ArgumentNullException(nameof(value));
        Label = UiHtml.Text(label, nameof(label));
    }

    /// <summary>Gets the submitted value.</summary>
    public string Value { get; }
    /// <summary>Gets the plain text label.</summary>
    public string Label { get; }
    /// <summary>Gets or sets a plain text line under the label, which search also matches.</summary>
    public string? Description { get; set; }
    /// <summary>Gets or sets a short plain text badge at the end of the option.</summary>
    public string? Badge { get; set; }
    /// <summary>Gets or sets the badge's tone.</summary>
    public CanopyTone BadgeTone { get; set; }
    /// <summary>Gets or sets an icon name the host's renderIcon draws, never raw markup.</summary>
    public string? Icon { get; set; }
    /// <summary>Gets or sets an avatar image address: a web, relative or image data address.</summary>
    public string? Avatar { get; set; }
    /// <summary>Gets or sets a two-letter country code, drawn as its flag emoji.</summary>
    public string? Flag { get; set; }
    /// <summary>Gets or sets the group heading the option sits under; consecutive options share a group.</summary>
    public string? Group { get; set; }
    /// <summary>Gets or sets whether the option starts chosen.</summary>
    public bool Selected { get; set; }
    /// <summary>Gets or sets whether the option shows but cannot be chosen.</summary>
    public bool Disabled { get; set; }
}
