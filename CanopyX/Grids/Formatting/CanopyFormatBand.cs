using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A threshold band: values up to its inclusive upper bound take its tone, its icon and its label. Bands rise; the last
/// band may leave its bound open to take every higher value.
/// </summary>
public sealed class CanopyFormatBand {
    /// <summary>Creates a band.</summary>
    /// <param name="upperBound">The inclusive upper bound, or null for the open last band.</param>
    /// <param name="tone">The band's tone.</param>
    /// <param name="label">An optional label: the band's name in the legend and its description for screen readers.</param>
    public CanopyFormatBand(double? upperBound, CanopyTone tone, string? label = null) {
        if (upperBound.HasValue && !CanopyGridPresenter.Safe(upperBound.Value)) throw new ArgumentOutOfRangeException(nameof(upperBound));
        if (tone.Name == null) throw new ArgumentException("A band needs a tone.", nameof(tone));
        CanopyFormatStyle.ValidateText(label, 64, nameof(label));
        UpperBound = upperBound; Tone = tone; Label = label;
    }

    /// <summary>Gets the inclusive upper bound, or null for the open last band.</summary>
    public double? UpperBound { get; }

    /// <summary>Gets the band's tone.</summary>
    public CanopyTone Tone { get; }

    /// <summary>Gets the band's label, or null.</summary>
    public string? Label { get; }

    /// <summary>Gets or sets the band's icon (a <see cref="CanopyFormatIcons"/> name or up to four characters), or null for the style's.</summary>
    public string? Icon { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (UpperBound.HasValue) writer.Name("upperBound").Number(UpperBound.Value);
        writer.Property("tone", Tone.Name).OptionalProperty("label", Label).OptionalProperty("icon", Icon).EndObject();
    }
}
