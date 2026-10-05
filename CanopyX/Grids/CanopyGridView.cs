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
    private int? _rowHeight;
    private int _pageSize = 100;
    private int _pageLength = 50;
    private int? _searchDelayMilliseconds;
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

    /// <summary>Gets or sets optional reporting capabilities. Null keeps the ordinary data-grid entry point.</summary>
    public CanopyGridReporting? Reporting { get; set; }

    /// <summary>Gets all rows of an inline source. Host sources must leave this collection empty.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Gets at most 64 ordered raw-value highlight rules. The first match wins independently for the row and each condition cell.</summary>
    public IList<CanopyGridHighlightRule> HighlightRules { get; } = new List<CanopyGridHighlightRule>();

    /// <summary>Gets or sets whether rows come from the complete inline dataset or a host query hook.</summary>
    public CanopyGridSourceKind Source { get; set; }

    /// <summary>Gets or sets known-count offset access or host-governed cursor traversal.</summary>
    /// <remarks>Cursor traversal requires a hosted, paged view and does not expose random page jumps.</remarks>
    public CanopyGridNavigation Navigation { get; set; }

    /// <summary>Gets or sets continuous scrolling or paged presentation.</summary>
    public CanopyGridPresentation Presentation { get; set; }

    /// <summary>Gets or sets the visible page length, from 1 to 10,000. Defaults to 50 and is independent of <see cref="PageSize"/>.</summary>
    public int PageLength {
        get => _pageLength;
        set {
            if (value < 1 || value > 10000) throw new ArgumentOutOfRangeException(nameof(value), value, "Visible page length must be between 1 and 10,000.");
            _pageLength = value;
        }
    }

    /// <summary>Gets or sets the fixed height, or the minimum and estimate for automatic rows, in CSS pixels between 20 and 64.</summary>
    public int RowHeight {
        get => _rowHeight ?? (Density == CanopyGridDensity.Compact ? 28 : Density == CanopyGridDensity.Comfortable ? 42 : 34);
        set {
            if (value < 20 || value > 64) throw new ArgumentOutOfRangeException(nameof(value), value, "Row height must be between 20 and 64 pixels.");
            _rowHeight = value;
        }
    }

    /// <summary>Gets or sets the row density. Explicit <see cref="RowHeight"/> values take precedence over density.</summary>
    public CanopyGridDensity Density { get; set; }

    /// <summary>Gets or sets whether alternate records have a subtle background. Defaults to false.</summary>
    public bool Zebra { get; set; }

    /// <summary>Gets or sets the host's plural record noun for search, result and empty-state text. Null uses translated rows.</summary>
    public string? Noun { get; set; }

    /// <summary>Gets or sets the host's explanation when the dataset is empty. Null uses the translated default.</summary>
    public string? EmptyReason { get; set; }

    /// <summary>Gets or sets whether to show result and selected-record counts in a status bar.</summary>
    public bool StatusBar { get; set; }

    /// <summary>Gets or sets whether rows measure their content. Defaults to false; <see cref="RowHeight"/> supplies the minimum and unseen-row estimate.</summary>
    public bool AutoRowHeight { get; set; }

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

    /// <summary>Gets or sets the search-input debounce in milliseconds, from 0 to 5,000. Null uses zero for inline sources and 300 for hosted sources.</summary>
    /// <remarks>Enter applies immediately. Input-method composition is never submitted before it completes. This setting affects controls, not programmatic queries.</remarks>
    public int? SearchDelayMilliseconds {
        get => _searchDelayMilliseconds;
        set {
            if (value < 0 || value > 5000) throw new ArgumentOutOfRangeException(nameof(value), value, "Search delay must be between 0 and 5,000 milliseconds.");
            _searchDelayMilliseconds = value;
        }
    }

    /// <summary>Gets the column identities searched by flat-grid queries. An empty collection searches every declared column, including hidden columns.</summary>
    public IList<string> SearchColumns { get; } = new List<string>();

    /// <summary>Gets or sets the session-storage key for this grid's saved view. Null disables persistence.</summary>
    public string? StateKey { get; set; }

    /// <summary>Gets or sets an initial query. Null uses an unfiltered query; cursor navigation requests the visible page length.</summary>
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
        writer.BeginObject().Envelope("grid").Property("id", Id).Property("label", Label);
        writer.Property("rowHeight", RowHeight);
        if (Density != CanopyGridDensity.Default) writer.Property("density", Density == CanopyGridDensity.Compact ? "compact" : "comfortable");
        if (Zebra) writer.Property("zebra", true);
        writer.OptionalProperty("noun", Noun).OptionalProperty("emptyReason", EmptyReason);
        if (StatusBar) writer.Property("statusBar", true);
        if (AutoRowHeight) writer.Property("autoRowHeight", true);
        writer.Property("pageSize", PageSize)
            .Property("selection", CanopyJsonNames.Selection(Selection)).Property("search", Search)
            .Name("columns").BeginArray();
        foreach (var column in Columns) {
            var width = column.Width;
            if (!column.HasExplicitWidth && Reporting != null && Reporting.Layout.TryGetValue(column.Id, out var layout))
                width = Math.Max(layout.Minimum, Math.Min(layout.Maximum, width));
            column.WriteJson(writer, grid: true, width: width);
        }
        writer.EndArray();
        if (HighlightRules.Count > 0) {
            writer.Name("highlightRules").BeginArray();
            foreach (var rule in HighlightRules) rule.WriteJson(writer);
            writer.EndArray();
        }
        if (Reporting != null) { writer.Name("reporting"); Reporting.WriteJson(writer); }
        if (Presentation == CanopyGridPresentation.Paged) writer.Property("presentation", "paged").Property("pageLength", PageLength);
        if (SearchDelayMilliseconds.HasValue) writer.Property("searchDelayMs", SearchDelayMilliseconds.Value);
        if (SearchColumns.Count > 0) {
            writer.Name("searchColumns").BeginArray();
            foreach (var column in SearchColumns) writer.String(column);
            writer.EndArray();
        }
        writer.Name("source").BeginObject().Property("kind", Source == CanopyGridSourceKind.Inline ? "inline" : "host")
            .Property("navigation", Navigation == CanopyGridNavigation.Cursor ? "cursor" : "offset").EndObject();
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
        if (Noun != null && (string.IsNullOrWhiteSpace(Noun) || Noun.Length > 256) || EmptyReason?.Length > 4096)
            throw new InvalidOperationException("Grid noun and empty reason must fit their text bounds.");
        if (Density != CanopyGridDensity.Default && Density != CanopyGridDensity.Compact && Density != CanopyGridDensity.Comfortable)
            throw new ArgumentOutOfRangeException(nameof(Density), Density, "Unknown grid density.");
        if (Presentation != CanopyGridPresentation.Continuous && Presentation != CanopyGridPresentation.Paged)
            throw new ArgumentOutOfRangeException(nameof(Presentation), Presentation, "Unknown grid presentation.");
        if (Navigation != CanopyGridNavigation.Offset && Navigation != CanopyGridNavigation.Cursor)
            throw new ArgumentOutOfRangeException(nameof(Navigation), Navigation, "Unknown grid navigation.");
        if (Navigation == CanopyGridNavigation.Cursor && (Source != CanopyGridSourceKind.Host || Presentation != CanopyGridPresentation.Paged))
            throw new InvalidOperationException("Cursor navigation requires a hosted, paged grid.");
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
        if (HighlightRules.Count > 64) throw new InvalidOperationException("A grid supports at most 64 highlight rules.");
        foreach (var rule in HighlightRules) {
            CanopyColumn? conditionColumn = null;
            foreach (var column in Columns) if (column.Id == rule?.Condition.Column) conditionColumn = column;
            if (rule == null || conditionColumn == null) throw new InvalidOperationException("Highlight rules require a declared condition column.");
            rule.Condition.Validate(conditionColumn);
        }
        Reporting?.Validate(Columns);
        if ((Reporting?.Grouping != null || Reporting?.Aggregates.Count > 0) && Navigation == CanopyGridNavigation.Cursor)
            throw new InvalidOperationException("Flat grouping and summaries require known-count offset navigation.");
        if (Reporting?.ViewStorage == CanopyGridViewStorage.Local && (string.IsNullOrWhiteSpace(StateKey) || StateKey!.Length > 512))
            throw new InvalidOperationException("Durable reporting preferences require a state key of 1 to 512 characters.");
        var searchable = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in SearchColumns) {
            if (id == null || !columnIds.Contains(id) || !searchable.Add(id)) throw new InvalidOperationException("Search columns must identify unique declared columns.");
        }
        if (Source == CanopyGridSourceKind.Host && Rows.Count != 0) throw new InvalidOperationException("A host grid obtains its rows from the host query hook; inline rows must be empty.");
        CanopyGridRows.Validate(Rows, columnIds, Columns);
        Query?.Validate(this);
        return columnIds;
    }
}
