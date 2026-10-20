using System;

namespace CanopyX.Data;

/// <summary>A row of a saved answer's result panel (<see cref="CanopyFlowAnswer.Result"/>), such as a new key shown once.</summary>
public sealed class CanopyFlowResultRow {
    /// <summary>Creates a row.</summary>
    /// <param name="label">The label: visible text.</param>
    /// <param name="value">The value, shown as text.</param>
    /// <param name="once">Whether the value is shown once only (the panel offers to copy it and says it will not show again).</param>
    /// <exception cref="ArgumentException"><paramref name="label"/> has no visible text.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyFlowResultRow(string label, string value, bool once = false) {
        Label = CanopyFlowText.Require(label, nameof(label));
        Value = value ?? throw new ArgumentNullException(nameof(value));
        IsShownOnce = once;
    }

    /// <summary>Gets the label.</summary>
    public string Label { get; }

    /// <summary>Gets the value.</summary>
    public string Value { get; }

    /// <summary>Gets whether the value is shown once only.</summary>
    public bool IsShownOnce { get; }
}