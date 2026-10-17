using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A data bar: a track before the value whose fill shows where the value lies between a minimum and a maximum.</summary>
/// <remarks>
/// Without bounds the bar runs from zero (or the lowest value, when it is negative) to the highest value: of every row of an
/// inline grid, or of the rows a host grid has received. Give bounds for host grids whose rows arrive in pages.
/// </remarks>
public sealed class CanopyFormatDataBar {
    private double? _minimum;
    private double? _maximum;

    /// <summary>Gets or sets the value of an empty bar, or null for automatic.</summary>
    public double? Minimum { get => _minimum; set => _minimum = Finite(value); }

    /// <summary>Gets or sets the value of a full bar, or null for automatic.</summary>
    public double? Maximum { get => _maximum; set => _maximum = Finite(value); }

    /// <summary>Gets or sets the bar's tone. None uses the style's tone, or info.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets whether the value stays visible beside the bar. Defaults to true; a hidden value stays readable by screen readers.</summary>
    public bool ShowValue { get; set; } = true;

    private static double? Finite(double? value) =>
        value.HasValue && !CanopyGridPresenter.Safe(value.Value) ? throw new ArgumentOutOfRangeException(nameof(value), value, "Bar bounds are finite numbers within the safe magnitude.") : value;

    internal void Validate() {
        if (Minimum.HasValue && Maximum.HasValue && Minimum.Value >= Maximum.Value) throw new InvalidOperationException("A data bar's minimum is below its maximum.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Minimum.HasValue) writer.Name("minimum").Number(Minimum.Value);
        if (Maximum.HasValue) writer.Name("maximum").Number(Maximum.Value);
        writer.OptionalProperty("tone", Tone.Name);
        if (!ShowValue) writer.Property("showValue", false);
        writer.EndObject();
    }
}
