using System;

namespace CanopyX.Data;

/// <summary>A labelled value: a detail of a check result (<see cref="CanopyFlowCheckResult.Details"/>).</summary>
public sealed class CanopyFlowDetail {
    /// <summary>Creates a detail.</summary>
    /// <param name="label">The label: visible text.</param>
    /// <param name="value">The value, shown as text (at most 1,000 characters show).</param>
    /// <exception cref="ArgumentException"><paramref name="label"/> has no visible text.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyFlowDetail(string label, string value) {
        Label = CanopyFlowText.Require(label, nameof(label));
        Value = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>Gets the label.</summary>
    public string Label { get; }

    /// <summary>Gets the value.</summary>
    public string Value { get; }
}