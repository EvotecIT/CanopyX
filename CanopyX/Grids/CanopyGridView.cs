using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Defines a flat data grid independently of tree hierarchy and host report composition.</summary>
/// <remarks>
/// Inline sources carry the complete dataset. Host sources obtain query result pages from a host hook;
/// the host owns transport, query execution, and authorization. Both use the same column and cell definitions.
/// </remarks>
public sealed class CanopyGridView {
    private int _rowHeight = 28;
    private int _pageSize = 100;
    private CanopyLabels _labels = new CanopyLabels();

    /// <summary>Creates a flat-grid definition.</summary>
    /// <param name="id">The grid identity, unique within the page.</param>
    /// <param name="label">The accessible name.</param>
    public CanopyGridView(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Grid label is required.", nameof(label));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the grid identity used to scope focus, selection, saved views, and result pages.</summary>
    public string Id { get; }

    /// <summary>Gets the accessible name.</summary>
    public string Label { get; }

    /// <summary>Gets the column definitions. No column has tree semantics.</summary>
    public IList<CanopyColumn> Columns { get; } = new List<CanopyColumn>();

    /// <summary>Gets all rows of an inline source. Host sources must leave this collection empty.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Gets or sets whether rows come from the complete inline dataset or a host query hook.</summary>
    public CanopyGridSourceKind Source { get; set; }

    /// <summary>Gets or sets the fixed row height in CSS pixels, between 20 and 64.</summary>
    public int RowHeight {
        get => _rowHeight;
        set {
            if (value < 20 || value > 64) throw new ArgumentOutOfRangeException(nameof(value), value, "Row height must be between 20 and 64 pixels.");
            _rowHeight = value;
        }
    }

    /// <summary>Gets or sets the requested result-page size, between 1 and 10,000.</summary>
    /// <remarks>Paging follows full-dataset filtering and sorting; it is not a limit on the inline dataset.</remarks>
    public int PageSize {
        get => _pageSize;
        set {
            if (value < 1 || value > 10000) throw new ArgumentOutOfRangeException(nameof(value), value, "Page size must be between 1 and 10,000.");
            _pageSize = value;
        }
    }

    /// <summary>Gets or sets row-selection behavior, independently of keyboard focus.</summary>
    public CanopySelectionMode Selection { get; set; }

    /// <summary>Gets or sets whether the grid exposes its search control. Defaults to true.</summary>
    public bool Search { get; set; } = true;

    /// <summary>Gets or sets the session-storage key for this grid's saved view. Null disables persistence.</summary>
    public string? StateKey { get; set; }

    /// <summary>Gets or sets an initial query. Null uses an unfiltered query with the view's page size.</summary>
    public CanopyGridQuery? Query { get; set; }

    /// <summary>Gets or sets the display time zone. Date values remain UTC independently of their display.</summary>
    public CanopyTimeZone TimeZone { get; set; }

    /// <summary>Gets or sets reusable translations for cell formatting and shared controls.</summary>
    public CanopyLabels Labels {
        get => _labels;
        set => _labels = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>Writes the HTML-safe <c>grid</c> document of the <c>canopyx/2</c> protocol.</summary>
    /// <returns>The serialized flat-grid definition.</returns>
    /// <exception cref="InvalidOperationException">The definition has ambiguous identities or incompatible source data.</exception>
    public string ToJson() {
        Validate();
        var writer = new CanopyJsonWriter(4096);
        writer.BeginObject().Envelope("grid").Property("id", Id).Property("label", Label)
            .Property("rowHeight", RowHeight).Property("pageSize", PageSize)
            .Property("selection", CanopyJsonNames.Selection(Selection)).Property("search", Search)
            .Name("columns").BeginArray();
        foreach (var column in Columns) column.WriteJson(writer);
        writer.EndArray().Name("source").BeginObject().Property("kind", Source == CanopyGridSourceKind.Inline ? "inline" : "host").EndObject();
        writer.OptionalProperty("stateKey", StateKey).OptionalProperty("timeZone", CanopyJsonNames.TimeZone(TimeZone));
        if (Query != null) {
            writer.Name("query");
            Query.WriteJson(writer, this);
        }
        if (Labels.HasRuntimeLabels) {
            writer.Name("labels");
            Labels.WriteJson(writer);
        }
        if (Source == CanopyGridSourceKind.Inline) {
            writer.Name("rows").BeginArray();
            foreach (var row in Rows) row.WriteJson(writer);
            writer.EndArray();
        }
        return writer.EndObject().ToString();
    }

    internal HashSet<string> Validate() {
        if (Source != CanopyGridSourceKind.Inline && Source != CanopyGridSourceKind.Host) {
            throw new ArgumentOutOfRangeException(nameof(Source), Source, "Unknown grid source.");
        }
        CanopyJsonNames.Selection(Selection);
        CanopyJsonNames.TimeZone(TimeZone);
        var columnIds = new HashSet<string>(StringComparer.Ordinal);
        var visible = 0;
        foreach (var column in Columns) {
            if (column == null || !columnIds.Add(column.Id)) throw new InvalidOperationException("Grid columns must have unique identities and cannot be null.");
            CanopyJsonNames.ColumnKind(column.Kind);
            if (column.Editable) throw new InvalidOperationException("Flat-grid editing is host composition; grid definitions do not expose edit proposals.");
            if (!column.Hidden) visible++;
        }
        if (visible == 0) throw new InvalidOperationException("A grid needs at least one visible column.");
        if (Source == CanopyGridSourceKind.Host && Rows.Count != 0) throw new InvalidOperationException("A host grid obtains its rows from the host query hook; inline rows must be empty.");
        CanopyGridRows.Validate(Rows, columnIds, Columns);
        Query?.Validate(this);
        return columnIds;
    }
}
