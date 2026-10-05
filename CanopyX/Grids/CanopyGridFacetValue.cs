using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A raw typed value and its positive occurrence count in a full-query facet.</summary>
public sealed class CanopyGridFacetValue {
    /// <summary>Creates a value/count bucket. Null represents both missing and null cells.</summary>
    /// <param name="value">The raw value; display metadata is not written.</param>
    /// <param name="count">The number of matching records with this value.</param>
    public CanopyGridFacetValue(CanopyCell? value, int count) {
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        Value = value;
        Count = count;
    }
    /// <summary>Gets the raw bucket value. Text and boolean values remain distinct.</summary>
    public CanopyCell? Value { get; }
    /// <summary>Gets the positive record count.</summary>
    public int Count { get; }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("value");
        if (Value == null) writer.Null(); else Value.WriteValue(writer);
        writer.Property("count", Count).EndObject();
    }
}
