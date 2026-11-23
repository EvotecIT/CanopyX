using System;
using CanopyX;

namespace CanopyX.Data;

/// <summary>A row of the review page's preview (<see cref="CanopyFlowPreview.Rows"/>): what submitting does to one thing.</summary>
public sealed class CanopyFlowPreviewRow {
    /// <summary>Creates a row.</summary>
    /// <param name="label">The label: visible text.</param>
    /// <param name="value">The value, shown as text (at most 1,000 characters show).</param>
    /// <param name="tone">How the value reads: neutral (the default), <see cref="Tone.Info"/>, <see cref="Tone.Success"/>,
    /// <see cref="Tone.Warning"/> or <see cref="Tone.Danger"/>.</param>
    /// <exception cref="ArgumentException"><paramref name="label"/> has no visible text, or <paramref name="tone"/> is another tone.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyFlowPreviewRow(string label, string value, Tone tone = default) {
        Label = CanopyFlowText.Require(label, nameof(label));
        Value = value ?? throw new ArgumentNullException(nameof(value));
        if (tone != Tone.None && tone != Tone.Neutral && tone != Tone.Info && tone != Tone.Success && tone != Tone.Warning && tone != Tone.Danger)
            throw new ArgumentException("A preview row's tone is neutral, info, success, warning or danger.", nameof(tone));
        Tone = tone;
    }

    /// <summary>Gets the label.</summary>
    public string Label { get; }

    /// <summary>Gets the value.</summary>
    public string Value { get; }

    /// <summary>Gets how the value reads; <see cref="Tone.None"/> reads as neutral.</summary>
    public Tone Tone { get; }
}