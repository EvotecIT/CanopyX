using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A stop of a colour scale: a position (the lowest or highest value, a number or a percentage) and a tone.</summary>
public sealed class CanopyFormatScaleStop {
    private CanopyFormatScaleStop(CanopyFormatScaleStopType type, double? value, CanopyTone tone) {
        if (tone.Name == null) throw new ArgumentException("A colour scale stop needs a tone.", nameof(tone));
        if (value.HasValue && !CanopyGridPresenter.Safe(value.Value)) throw new ArgumentOutOfRangeException(nameof(value));
        if (type == CanopyFormatScaleStopType.Percent && (value < 0 || value > 100)) throw new ArgumentOutOfRangeException(nameof(value), value, "A percentage is from 0 to 100.");
        Type = type; Value = value; Tone = tone;
    }

    /// <summary>Gets where the stop sits.</summary>
    public CanopyFormatScaleStopType Type { get; }

    /// <summary>Gets the number or percentage of a <see cref="CanopyFormatScaleStopType.Number"/> or <see cref="CanopyFormatScaleStopType.Percent"/> stop.</summary>
    public double? Value { get; }

    /// <summary>Gets the stop's tone.</summary>
    public CanopyTone Tone { get; }

    /// <summary>Returns a stop at the lowest value.</summary>
    /// <param name="tone">The tone.</param>
    /// <returns>The stop.</returns>
    public static CanopyFormatScaleStop Minimum(CanopyTone tone) => new CanopyFormatScaleStop(CanopyFormatScaleStopType.Minimum, null, tone);

    /// <summary>Returns a stop at the highest value.</summary>
    /// <param name="tone">The tone.</param>
    /// <returns>The stop.</returns>
    public static CanopyFormatScaleStop Maximum(CanopyTone tone) => new CanopyFormatScaleStop(CanopyFormatScaleStopType.Maximum, null, tone);

    /// <summary>Returns a stop at a number.</summary>
    /// <param name="value">The number.</param>
    /// <param name="tone">The tone.</param>
    /// <returns>The stop.</returns>
    public static CanopyFormatScaleStop Number(double value, CanopyTone tone) => new CanopyFormatScaleStop(CanopyFormatScaleStopType.Number, value, tone);

    /// <summary>Returns a stop at a percentage of the way from the lowest to the highest value.</summary>
    /// <param name="percent">The percentage, from 0 to 100.</param>
    /// <param name="tone">The tone.</param>
    /// <returns>The stop.</returns>
    public static CanopyFormatScaleStop Percent(double percent, CanopyTone tone) => new CanopyFormatScaleStop(CanopyFormatScaleStopType.Percent, percent, tone);

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("type", CanopyFormatNames.Wire(Type));
        if (Value.HasValue) writer.Name("value").Number(Value.Value);
        writer.Property("tone", Tone.Name).EndObject();
    }
}
