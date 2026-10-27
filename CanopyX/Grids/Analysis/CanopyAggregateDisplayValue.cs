namespace CanopyX;

/// <summary>A transformed numeric aggregate and its export number format.</summary>
public readonly struct CanopyAggregateDisplayValue {
    internal CanopyAggregateDisplayValue(double? value, CanopyShowAs mode) { Value = value; Mode = mode; }
    /// <summary>Gets the transformed value; percentages remain fractions.</summary>
    public double? Value { get; }
    /// <summary>Gets the transformation applied to the raw aggregate.</summary>
    public CanopyShowAs Mode { get; }
    /// <summary>Gets the spreadsheet number format paired with the numeric value.</summary>
    public string NumberFormat => CanopyAggregateDisplay.NumberFormat(Mode);
}
