using System;

namespace CanopyX;

/// <summary>Immutable width intent and bounds for a column, expressed in CSS pixels.</summary>
public sealed class CanopyColumnSizing {
    private CanopyColumnSizing(int? width, int minimum, int maximum, double flex, bool fixedWidth, CanopyColumnAutoSize measure) {
        if (minimum < CanopyColumn.MinWidth || maximum < minimum) throw new ArgumentOutOfRangeException(nameof(minimum), "Width bounds must start at 40 pixels and be ordered.");
        if (width.HasValue && (width < minimum || width > maximum)) throw new ArgumentOutOfRangeException(nameof(width), "The preferred width must be within its bounds.");
        if (double.IsNaN(flex) || double.IsInfinity(flex) || flex < 0 || flex > 100) throw new ArgumentOutOfRangeException(nameof(flex));
        if (!Enum.IsDefined(typeof(CanopyColumnAutoSize), measure)) throw new ArgumentOutOfRangeException(nameof(measure));
        Width = width; Minimum = minimum; Maximum = maximum; FlexWeight = flex; IsFixed = fixedWidth; Measure = measure;
    }

    /// <summary>Gets the optional preferred width. Null lets loaded content determine the initial width.</summary>
    public int? Width { get; }
    /// <summary>Gets the minimum width in CSS pixels.</summary>
    public int Minimum { get; }
    /// <summary>Gets the maximum width in CSS pixels.</summary>
    public int Maximum { get; }
    /// <summary>Gets the share of spare grid width, or zero for ordinary fitting.</summary>
    public double FlexWeight { get; }
    /// <summary>Gets whether the declared width remains fixed during automatic fitting.</summary>
    public bool IsFixed { get; }
    /// <summary>Gets which content the grid measures.</summary>
    public CanopyColumnAutoSize Measure { get; }

    /// <summary>Fits loaded content within the supplied CSS pixel bounds.</summary>
    public static CanopyColumnSizing Content(int minimum = 40, int maximum = int.MaxValue, CanopyColumnAutoSize measure = CanopyColumnAutoSize.Content) =>
        new CanopyColumnSizing(null, minimum, maximum, 0, false, measure);

    /// <summary>Starts at a preferred CSS pixel width and permits fitting within the supplied bounds.</summary>
    public static CanopyColumnSizing Preferred(int width, int minimum = 40, int maximum = int.MaxValue, CanopyColumnAutoSize measure = CanopyColumnAutoSize.Content) =>
        new CanopyColumnSizing(width, minimum, maximum, 0, false, measure);

    /// <summary>Uses one fixed CSS pixel width during automatic fitting. Users can still resize the column.</summary>
    public static CanopyColumnSizing Fixed(int width) => new CanopyColumnSizing(width, 40, int.MaxValue, 0, true, CanopyColumnAutoSize.None);

    /// <summary>Shares spare grid width with other flex columns within the supplied CSS pixel bounds.</summary>
    public static CanopyColumnSizing Flex(double weight = 1, int minimum = 40, int maximum = int.MaxValue, int? preferredWidth = null, CanopyColumnAutoSize measure = CanopyColumnAutoSize.Content) {
        if (weight <= 0) throw new ArgumentOutOfRangeException(nameof(weight));
        return new CanopyColumnSizing(preferredWidth, minimum, maximum, weight, false, measure);
    }
}
