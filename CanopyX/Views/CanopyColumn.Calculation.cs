namespace CanopyX;

public sealed partial class CanopyColumn {
    /// <summary>Gets or sets the immutable expression that computes this flat-grid column from raw row values.</summary>
    /// <remarks>Calculated columns cannot be editable. Tree views do not support calculations.
    /// Hosted grids supply authorized calculated values from their data provider.</remarks>
    public CanopyCalculation? Calculation { get; set; }
}
