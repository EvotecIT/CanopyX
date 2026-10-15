namespace CanopyX;

/// <summary>Where a colour scale stop sits.</summary>
public enum CanopyFormatScaleStopType {
    /// <summary>At the lowest value of the column (<c>min</c>).</summary>
    Minimum = 0,
    /// <summary>At the highest value of the column (<c>max</c>).</summary>
    Maximum,
    /// <summary>At a number (<c>number</c>).</summary>
    Number,
    /// <summary>At a percentage of the way from the lowest to the highest value (<c>percent</c>).</summary>
    Percent
}
