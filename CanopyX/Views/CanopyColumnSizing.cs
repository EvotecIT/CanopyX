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

    /// <summary>Uses one fixed CSS pixel width during automatic fitting. Users can still resize the column within the supplied bounds.</summary>
    /// <param name="width">The initial fixed width, within the supplied bounds.</param>
    /// <param name="minimum">The minimum user-resized width in CSS pixels, at least 40.</param>
    /// <param name="maximum">The maximum user-resized width in CSS pixels.</param>
    /// <returns>Fixed automatic sizing with bounded user resizing.</returns>
    public static CanopyColumnSizing Fixed(int width, int minimum = 40, int maximum = int.MaxValue) =>
        new CanopyColumnSizing(width, minimum, maximum, 0, true, CanopyColumnAutoSize.None);

    /// <summary>Returns a copy of this sizing with a different maximum width. The preferred width, minimum, flex weight, fixed flag and measuring are kept.</summary>
    /// <param name="maximum">The new maximum width in CSS pixels, at least the minimum and any preferred width.</param>
    /// <returns>A new sizing; this instance is unchanged.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The maximum is below the minimum or the preferred width.</exception>
    public CanopyColumnSizing WithMaximum(int maximum) {
        if (maximum < Minimum || Width > maximum) throw new ArgumentOutOfRangeException(nameof(maximum), maximum, "The maximum must be at least the minimum and the preferred width.");
        return new CanopyColumnSizing(Width, Minimum, maximum, FlexWeight, IsFixed, Measure);
    }

    /// <summary>Returns a copy of this sizing with a different minimum width. The preferred width, maximum, flex weight, fixed flag and measuring are kept.</summary>
    /// <param name="minimum">The new minimum width in CSS pixels, at least 40 and at most the maximum and any preferred width.</param>
    /// <returns>A new sizing; this instance is unchanged.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The minimum is below 40 pixels, or above the maximum or the preferred width.</exception>
    public CanopyColumnSizing WithMinimum(int minimum) {
        if (minimum < CanopyColumn.MinWidth || minimum > Maximum || Width < minimum) throw new ArgumentOutOfRangeException(nameof(minimum), minimum, "The minimum must be at least 40 pixels and at most the maximum and the preferred width.");
        return new CanopyColumnSizing(Width, minimum, Maximum, FlexWeight, IsFixed, Measure);
    }

    /// <summary>Shares spare grid width with other flex columns within the supplied CSS pixel bounds.</summary>
    public static CanopyColumnSizing Flex(double weight = 1, int minimum = 40, int maximum = int.MaxValue, int? preferredWidth = null, CanopyColumnAutoSize measure = CanopyColumnAutoSize.Content) {
        if (weight <= 0) throw new ArgumentOutOfRangeException(nameof(weight));
        return new CanopyColumnSizing(preferredWidth, minimum, maximum, weight, false, measure);
    }
}
