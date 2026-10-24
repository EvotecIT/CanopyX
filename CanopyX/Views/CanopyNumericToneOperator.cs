namespace CanopyX;

/// <summary>The numeric comparison used by a column's ordered text-tone rules.</summary>
public enum CanopyNumericToneOperator {
    /// <summary>The raw number is less than or equal to the threshold.</summary>
    AtMost,
    /// <summary>The raw number is greater than or equal to the threshold.</summary>
    AtLeast,
    /// <summary>The raw number is strictly less than the threshold.</summary>
    Below,
    /// <summary>The raw number is strictly greater than the threshold.</summary>
    Above
}
