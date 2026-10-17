using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A two- or three-stop colour scale: each cell takes a tint mixed between the tones of the stops around its value. The
/// tones come from the theme, so the scale follows the light, dark and print palettes.
/// </summary>
public sealed class CanopyFormatColorScale {
    /// <summary>Creates a scale from its stops.</summary>
    /// <param name="stops">Two or three stops.</param>
    public CanopyFormatColorScale(params CanopyFormatScaleStop[] stops) {
        if (stops == null) throw new ArgumentNullException(nameof(stops));
        foreach (var stop in stops) Stops.Add(stop ?? throw new ArgumentException("Stops cannot be null.", nameof(stops)));
    }

    /// <summary>Gets the stops, two or three.</summary>
    public IList<CanopyFormatScaleStop> Stops { get; } = new List<CanopyFormatScaleStop>();

    /// <summary>Returns a scale from the lowest value's tone to the highest value's tone.</summary>
    /// <param name="low">The tone of the lowest value.</param>
    /// <param name="high">The tone of the highest value.</param>
    /// <returns>The scale.</returns>
    public static CanopyFormatColorScale TwoColor(CanopyTone low, CanopyTone high) => new CanopyFormatColorScale(CanopyFormatScaleStop.Minimum(low), CanopyFormatScaleStop.Maximum(high));

    /// <summary>Returns a scale through a midpoint tone halfway between the lowest and highest values.</summary>
    /// <param name="low">The tone of the lowest value.</param>
    /// <param name="middle">The tone of the midpoint.</param>
    /// <param name="high">The tone of the highest value.</param>
    /// <returns>The scale.</returns>
    public static CanopyFormatColorScale ThreeColor(CanopyTone low, CanopyTone middle, CanopyTone high) =>
        new CanopyFormatColorScale(CanopyFormatScaleStop.Minimum(low), CanopyFormatScaleStop.Percent(50, middle), CanopyFormatScaleStop.Maximum(high));

    internal void Validate() {
        if (Stops.Count < 2 || Stops.Count > 3) throw new InvalidOperationException("A colour scale has two or three stops.");
        foreach (var stop in Stops) if (stop == null) throw new InvalidOperationException("A colour scale cannot contain a null stop.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("stops").BeginArray();
        foreach (var stop in Stops) stop.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
