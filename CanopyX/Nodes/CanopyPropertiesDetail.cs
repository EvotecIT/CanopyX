using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A detail row that shows a list of name and value pairs, for example the attributes of a file.
/// </summary>
public sealed class CanopyPropertiesDetail : CanopyDetail {
    /// <summary>Gets the properties in display order.</summary>
    public IList<CanopyProperty> Items { get; } = new List<CanopyProperty>();

    /// <summary>Adds a property.</summary>
    /// <param name="name">The property name.</param>
    /// <param name="value">The property value.</param>
    /// <returns>This detail, for chaining.</returns>
    public CanopyPropertiesDetail Add(string name, CanopyCell value) {
        Items.Add(new CanopyProperty(name, value));
        return this;
    }

    internal override string Type => "properties";

    internal override int AutomaticHeight => Math.Min(16, Items.Count);

    internal override void WriteContent(CanopyJsonWriter writer) {
        writer.Name("items").BeginArray();
        foreach (var item in Items) {
            if (item == null) {
                throw new InvalidOperationException("A properties detail cannot contain a null item.");
            }

            writer.BeginObject().Property("name", item.Name).Name("value");
            item.Value.WriteJson(writer);
            writer.EndObject();
        }

        writer.EndArray();
    }
}
