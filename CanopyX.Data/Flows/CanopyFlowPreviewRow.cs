using System;

namespace CanopyX.Data;

/// <summary>A row of the review page's preview (<see cref="CanopyFlowPreview.Rows"/>): what submitting does to one thing.</summary>
public sealed class CanopyFlowPreviewRow {
    /// <summary>Creates a row.</summary>
    /// <param name="label">The label: visible text.</param>
    /// <param name="value">The value, shown as text (at most 1,000 characters show).</param>
    /// <param name="tone">How the value reads.</param>
    /// <exception cref="ArgumentException"><paramref name="label"/> has no visible text.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyFlowPreviewRow(string label, string value, CanopyFlowTone tone = CanopyFlowTone.Neutral) {
        Label = CanopyFlowText.Require(label, nameof(label));
        Value = value ?? throw new ArgumentNullException(nameof(value));
        Tone = tone;
    }

    /// <summary>Gets the label.</summary>
    public string Label { get; }

    /// <summary>Gets the value.</summary>
    public string Value { get; }

    /// <summary>Gets how the value reads.</summary>
    public CanopyFlowTone Tone { get; }
}