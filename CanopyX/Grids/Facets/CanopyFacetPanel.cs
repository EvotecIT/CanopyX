using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A panel of facets beside or above a flat grid: value lists with counts and ranges with histograms for the columns it names,
/// which filter each other (each facet counts the result without its own column's conditions).
/// </summary>
/// <remarks>
/// <para>Set it on <see cref="CanopyDataGridView.FacetPanel"/>. The reader's choices are ordinary column conditions, so the query,
/// the condition chips, saved views and exports carry them; the grid state also remembers whether the panel is open. Where the
/// panel does not fit (a phone or a narrow column) a "Filter by" toolbar button opens it as a full-screen sheet.</para>
/// <para>Inline grids count every row. A hosted grid's facets must be declared facet columns
/// (<see cref="CanopyGridReporting.FacetColumns"/>): their counts come from the source's value lists (<c>gridFacetQuery</c>), which
/// <c>CanopyX.Data</c> answers.</para>
/// </remarks>
public sealed class CanopyFacetPanel {
    private int? _width;
    private string? _label;

    /// <summary>Gets the facets, in panel order: 1 to 24 distinct columns of the grid.</summary>
    public IList<CanopyFacet> Facets { get; } = new List<CanopyFacet>();

    /// <summary>Gets or sets where the panel sits. Defaults to <see cref="CanopyFacetPosition.Side"/>.</summary>
    public CanopyFacetPosition Position { get; set; }

    /// <summary>Gets or sets whether the panel starts open. Defaults to true; a saved view keeps the reader's choice.</summary>
    public bool Open { get; set; } = true;

    /// <summary>Gets or sets whether the reader can collapse the panel. Defaults to true.</summary>
    public bool Collapsible { get; set; } = true;

    /// <summary>Gets or sets the width of a side panel in CSS pixels, 180 to 480; null keeps 260.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 180 to 480.</exception>
    public int? Width {
        get => _width;
        set => _width = value < 180 || value > 480 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A side panel is 180 to 480 pixels wide.") : value;
    }

    /// <summary>Gets or sets the panel's heading; null uses the translated "Filter by".</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 256 characters.</exception>
    public string? Label {
        get => _label;
        set => _label = value != null && (value.Trim().Length == 0 || value.Length > 256) ? throw new ArgumentException("A panel label needs 1 to 256 visible characters.", nameof(value)) : value;
    }

    /// <summary>Adds a facet for a column and returns the panel, for fluent authoring.</summary>
    /// <param name="column">The column id.</param>
    /// <param name="kind">The facet kind; <see cref="CanopyFacetKind.Auto"/> picks a value list for text and a range for numbers and dates.</param>
    /// <returns>This panel.</returns>
    public CanopyFacetPanel Add(string column, CanopyFacetKind kind = CanopyFacetKind.Auto) {
        Facets.Add(new CanopyFacet(column) { Kind = kind });
        return this;
    }

    internal void Validate(CanopyDataGridView view) {
        if (Facets.Count == 0 || Facets.Count > 24) throw new InvalidOperationException("A facet panel needs 1 to 24 facets.");
        if (!Enum.IsDefined(typeof(CanopyFacetPosition), Position)) throw new ArgumentOutOfRangeException(nameof(Position), Position, "Unknown facet panel position.");
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) columns[column.Id] = column;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var facet in Facets) {
            if (facet == null || !seen.Add(facet.Column)) throw new InvalidOperationException("Facets must name distinct columns and cannot be null.");
            if (!columns.TryGetValue(facet.Column, out var column)) throw new InvalidOperationException("Facet '" + facet.Column + "' names an undeclared column.");
            facet.Validate(column);
            if (view.Source.Kind == CanopyGridSourceKind.Host && view.Reporting?.FacetColumns.Contains(facet.Column) != true)
                throw new InvalidOperationException("Facet '" + facet.Column + "' of a hosted grid must be a reporting facet column, so its source answers value lists.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("columns").BeginArray();
        foreach (var facet in Facets) facet.WriteJson(writer);
        writer.EndArray();
        if (Position == CanopyFacetPosition.Top) writer.Property("position", "top");
        if (Position == CanopyFacetPosition.Toolbar) writer.Property("position", "toolbar");
        if (!Open) writer.Property("open", false);
        if (!Collapsible) writer.Property("collapsible", false);
        if (_width.HasValue) writer.Property("width", _width.Value);
        writer.OptionalProperty("label", _label);
        writer.EndObject();
    }
}
