using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>One axis of a matrix: its items (rows or columns), their attributes, and how the axis groups and sorts at first.</summary>
public sealed class CanopyMatrixAxis {
    /// <summary>Gets or sets the axis's title, such as "Destination". Plain text of at most 200 characters; null for none.</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets what one item is called in counts, such as "domain controllers". At most 64 characters; null for "rows" or "columns".</summary>
    public string? Noun { get; set; }

    /// <summary>
    /// Gets or sets how a group heading on this axis counts its members, with <c>{count}</c> and optionally one form per plural
    /// category, such as <c>"[one]{count} domain controller[other]{count} domain controllers"</c>. Visible text of at most 200
    /// characters; null takes <see cref="CanopyLabels.MatrixGroupCount"/>, which is the count alone. The interactive matrix, its
    /// print table and the static table use it.
    /// </summary>
    public string? GroupCount { get; set; }

    /// <summary>Gets the attributes items carry, at most 32.</summary>
    public IList<CanopyMatrixAttribute> Attributes { get; } = new List<CanopyMatrixAttribute>();

    /// <summary>Gets the items in their declared order, at most 10,000.</summary>
    public IList<CanopyMatrixItem> Items { get; } = new List<CanopyMatrixItem>();

    /// <summary>Gets or sets the attribute the axis is grouped by at first; null for no groups.</summary>
    public string? GroupBy { get; set; }

    /// <summary>
    /// Gets or sets what the axis is sorted by at first: <see cref="CanopyMatrix.SortByLabel"/>, <see cref="CanopyMatrix.SortByTotal"/>,
    /// an attribute id, or null for the declared order.
    /// </summary>
    public string? SortBy { get; set; }

    /// <summary>Gets or sets whether the first sort is descending.</summary>
    public bool SortDescending { get; set; }

    /// <summary>Adds an attribute and returns the axis, for chaining.</summary>
    /// <param name="id">The attribute id.</param>
    /// <param name="title">The title.</param>
    /// <param name="kind">How values sort and format.</param>
    /// <param name="facet">Whether the filter panel lists its values.</param>
    /// <returns>The axis.</returns>
    public CanopyMatrixAxis Attribute(string id, string title, CanopyColumnKind kind = CanopyColumnKind.Text, bool facet = false) {
        Attributes.Add(new CanopyMatrixAttribute(id, title, kind) { Facet = facet });
        return this;
    }

    /// <summary>Adds an item and returns the axis, for chaining.</summary>
    /// <param name="id">The item id, unique on the axis.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the item's values, secondary text or link, or null.</param>
    /// <returns>The axis.</returns>
    public CanopyMatrixAxis Item(string id, string label, Action<CanopyMatrixItem>? configure = null) {
        var item = new CanopyMatrixItem(id, label);
        configure?.Invoke(item);
        Items.Add(item);
        return this;
    }
}
