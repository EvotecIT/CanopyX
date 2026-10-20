using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>An entity on a matrix axis: a row or a column, such as a domain controller or a service.</summary>
public sealed class CanopyMatrixItem {
    /// <summary>Creates an item.</summary>
    /// <param name="id">The stable id, unique on its axis; a nonempty identifier of at most 256 characters.</param>
    /// <param name="label">The label in its header: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty or too long.</exception>
    public CanopyMatrixItem(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the item's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the label. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets a second line for the row header and the tooltip, such as a host name. At most 200 characters.</summary>
    public string? Secondary { get; set; }

    /// <summary>
    /// Gets or sets where the header links to: an http, https or mailto address, or a relative one such as <c>#dc/dc01</c>. Other
    /// schemes (javascript, data, file) are refused. Null draws plain text.
    /// </summary>
    public string? Href { get; set; }

    /// <summary>Gets the values of the axis's attributes, by attribute id.</summary>
    public IDictionary<string, CanopyCell> Values { get; } = new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Sets an attribute's value and returns the item, for chaining.</summary>
    /// <param name="attribute">The attribute id.</param>
    /// <param name="value">The value.</param>
    /// <returns>The item.</returns>
    public CanopyMatrixItem Value(string attribute, CanopyCell value) {
        Values[attribute] = value;
        return this;
    }
}
