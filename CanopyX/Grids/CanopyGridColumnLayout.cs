using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Immutable width constraints and optional flexible sizing for a reporting column.</summary>
public sealed class CanopyGridColumnLayout {
    /// <summary>Creates width constraints in CSS pixels and a relative weight for unused viewport width.</summary>
    /// <param name="minimum">Minimum width, at least 40 pixels.</param>
    /// <param name="maximum">Maximum width, at least the minimum.</param>
    /// <param name="flex">A finite weight from zero to 100. Zero keeps a fixed width; manual sizing disables flex until reset or state restoration.</param>
    /// <exception cref="ArgumentOutOfRangeException">The bounds or weight are invalid.</exception>
    public CanopyGridColumnLayout(int minimum = 40, int maximum = int.MaxValue, double flex = 0) {
        if (minimum < CanopyColumn.MinWidth) throw new ArgumentOutOfRangeException(nameof(minimum));
        if (maximum < minimum) throw new ArgumentOutOfRangeException(nameof(maximum));
        if (double.IsNaN(flex) || double.IsInfinity(flex) || flex < 0 || flex > 100) throw new ArgumentOutOfRangeException(nameof(flex));
        Minimum = minimum; Maximum = maximum; Flex = flex;
    }

    /// <summary>Gets the minimum rendered or manually assigned width in CSS pixels.</summary>
    public int Minimum { get; }
    /// <summary>Gets the maximum rendered or manually assigned width in CSS pixels.</summary>
    public int Maximum { get; }
    /// <summary>Gets the relative weight for unused viewport width. Columns never shrink below their saved base widths.</summary>
    public double Flex { get; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("minimum", Minimum).Property("maximum", Maximum);
        if (Flex > 0) writer.Name("flex").Number(Flex);
        writer.EndObject();
    }
}
