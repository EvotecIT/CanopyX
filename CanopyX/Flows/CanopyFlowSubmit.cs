namespace CanopyX;

/// <summary>The submit button of a flow (<see cref="CanopyFlow.Submit"/>).</summary>
public sealed class CanopyFlowSubmit {
    /// <summary>Creates submit settings.</summary>
    /// <param name="label">The button's text, or null for the translated default "Submit".</param>
    public CanopyFlowSubmit(string? label = null) {
        Label = label;
    }

    /// <summary>Gets or sets the button's text, for example "Save settings"; null uses the translated default. Plain text of at most 80 characters.</summary>
    public string? Label { get; set; }
}
