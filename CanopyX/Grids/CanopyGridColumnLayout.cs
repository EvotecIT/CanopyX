using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Immutable width constraints and optional flexible sizing for a reporting column.</summary>
public sealed class CanopyGridColumnLayout {
    /// <summary>Creates width constraints in CSS pixels and a relative weight for unused viewport width.</summary>
    /// <param name="minimum">Minimum width, at least 40 pixels.</param>
    /// <param name="maximum">Maximum width, at least the minimum.</param>
    /// <param name="flex">A finite weight from zero to 100. Zero keeps a fixed width; manual sizing disables flex until reset or state restoration.</param>
    /// <param name="pin">Requested edge placement. Pins are temporarily suspended when they cannot leave the configured center width.</param>
    /// <param name="priority">Responsive retention priority; smaller values remain visible longer. Equal priorities hide from the end of the current order.</param>
    /// <param name="alwaysVisible">Whether responsive layout must retain the column. Explicit user hiding remains possible.</param>
    /// <exception cref="ArgumentOutOfRangeException">The bounds or weight are invalid.</exception>
    public CanopyGridColumnLayout(int minimum = 40, int maximum = int.MaxValue, double flex = 0,
        CanopyGridColumnPin pin = CanopyGridColumnPin.None, int priority = int.MaxValue, bool alwaysVisible = false) {
        if (minimum < CanopyColumn.MinWidth) throw new ArgumentOutOfRangeException(nameof(minimum));
        if (maximum < minimum) throw new ArgumentOutOfRangeException(nameof(maximum));
        if (double.IsNaN(flex) || double.IsInfinity(flex) || flex < 0 || flex > 100) throw new ArgumentOutOfRangeException(nameof(flex));
        if (!Enum.IsDefined(typeof(CanopyGridColumnPin), pin)) throw new ArgumentOutOfRangeException(nameof(pin));
        if (priority < 0) throw new ArgumentOutOfRangeException(nameof(priority));
        Minimum = minimum; Maximum = maximum; Flex = flex; Pin = pin; Priority = priority; AlwaysVisible = alwaysVisible;
    }

    /// <summary>Gets the minimum rendered or manually assigned width in CSS pixels.</summary>
    public int Minimum { get; }
    /// <summary>Gets the maximum rendered or manually assigned width in CSS pixels.</summary>
    public int Maximum { get; }
    /// <summary>Gets the relative weight for unused viewport width. Columns never shrink below their saved base widths.</summary>
    public double Flex { get; }
    /// <summary>Gets requested edge placement. Effective pins depend on available viewport width.</summary>
    public CanopyGridColumnPin Pin { get; }
    /// <summary>Gets responsive retention priority; lower values remain visible longer.</summary>
    public int Priority { get; }
    /// <summary>Gets whether responsive layout retains this column unless the user explicitly hides it.</summary>
    public bool AlwaysVisible { get; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("minimum", Minimum).Property("maximum", Maximum);
        if (Flex > 0) writer.Name("flex").Number(Flex);
        if (Pin != CanopyGridColumnPin.None) writer.Property("pin", Pin == CanopyGridColumnPin.Left ? "left" : "right");
        if (Priority != int.MaxValue) writer.Property("priority", Priority);
        if (AlwaysVisible) writer.Property("alwaysVisible", true);
        writer.EndObject();
    }
}
