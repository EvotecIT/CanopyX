namespace CanopyX;

/// <summary>A read-only plain-text fact on an information step. Facts never become editable answers or submission values.</summary>
public sealed class CanopyFlowFact {
    /// <summary>Creates a fact with a short label and the complete text value (up to 32,768 characters).</summary>
    public CanopyFlowFact(string label, string value) { Label = label; Value = value; }
    /// <summary>Gets or sets the plain label, at most 200 characters.</summary>
    public string Label { get; set; }
    /// <summary>Gets or sets the complete plain text, wrapped without a preview clamp.</summary>
    public string Value { get; set; }
}
