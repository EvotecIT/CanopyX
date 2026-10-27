namespace CanopyX.Html.Ui;

/// <summary>A wizard step with host-owned state and explicitly trusted content.</summary>
public sealed class CanopyStep {
    /// <summary>Creates a step with an identity unique within its stepper.</summary>
    public CanopyStep(string id, string label) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
    }

    /// <summary>Gets the local step identity.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text step label.</summary>
    public string Label { get; }
    /// <summary>Gets or sets a plain text description, such as an issue count.</summary>
    public string? Description { get; set; }
    /// <summary>Gets or sets trusted HTML inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string ContentHtml { get; set; } = string.Empty;
    /// <summary>Gets or sets the host-supplied progress state. In interactive mode the selected step projects as current unless it is in error; reports preserve completed and skipped states.</summary>
    public CanopyStepState State { get; set; }
    /// <summary>Gets or sets the readable state text for reports and accessible names; null uses the default state label.</summary>
    public string? StateLabel { get; set; }
    /// <summary>Gets or sets whether this step may be skipped.</summary>
    public bool Optional { get; set; }
    /// <summary>Gets or sets whether an upcoming step has already been visited and may be revisited in a linear wizard.</summary>
    public bool Visited { get; set; }
}
