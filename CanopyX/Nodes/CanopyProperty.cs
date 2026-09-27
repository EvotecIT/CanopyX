using System;

namespace CanopyX;

/// <summary>
/// One name and value pair in a <see cref="CanopyPropertiesDetail"/>.
/// </summary>
public sealed class CanopyProperty {
    /// <summary>Creates a property.</summary>
    /// <param name="name">The property name.</param>
    /// <param name="value">The property value.</param>
    /// <exception cref="ArgumentException"><paramref name="name"/> is null or empty.</exception>
    public CanopyProperty(string name, CanopyCell value) {
        if (string.IsNullOrEmpty(name)) {
            throw new ArgumentException("Property name is required.", nameof(name));
        }

        Name = name;
        Value = value ?? new CanopyCell();
    }

    /// <summary>Gets the property name.</summary>
    public string Name { get; }

    /// <summary>Gets the property value.</summary>
    public CanopyCell Value { get; }
}
