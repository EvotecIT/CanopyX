using System;

namespace CanopyX.Data;

/// <summary>One value-list bucket: a raw value and the number of matching records that have it.</summary>
public sealed class CanopyFacetBucket {
    /// <summary>Creates a bucket.</summary>
    /// <param name="value">The raw value (normalized through <see cref="CanopyDataValues.Normalize(object?)"/>); null for missing values.</param>
    /// <param name="count">The positive record count.</param>
    public CanopyFacetBucket(object? value, int count) {
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        Value = CanopyDataValues.Normalize(value);
        Count = count;
    }

    /// <summary>Gets the normalized raw value.</summary>
    public object? Value { get; }

    /// <summary>Gets the record count.</summary>
    public int Count { get; }
}
