using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One named value of an object: a property of a structured cell (<see cref="CanopyCell.Fields"/>).</summary>
/// <remarks>The value may be structured itself (a list, another object, a collection), up to the structure depth limit.</remarks>
public sealed class CanopyCellField {
    /// <summary>Creates a named value.</summary>
    /// <param name="name">The visible name, 1 to 4,096 characters.</param>
    /// <param name="value">The value; null is an empty value.</param>
    /// <exception cref="ArgumentException">The name is blank or too long.</exception>
    public CanopyCellField(string name, CanopyCell? value) {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 4096) throw new ArgumentException("A field name has 1 to 4,096 visible characters.", nameof(name));
        Name = name;
        Value = value;
    }

    /// <summary>Gets the visible name.</summary>
    public string Name { get; }

    /// <summary>Gets the value, or null for an empty value.</summary>
    public CanopyCell? Value { get; }

    /// <summary>Gets or sets how the value is formatted when it has no display text: text (the default), a number or a date.</summary>
    public CanopyColumnKind Kind { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("name", Name).Name("value");
        if (Value == null) writer.Null(); else Value.WriteJson(writer);
        if (Kind != CanopyColumnKind.Text) writer.Property("kind", CanopyJsonNames.ColumnKind(Kind));
        writer.EndObject();
    }
}
