using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Defines a flat data grid independently of tree hierarchy and host report composition.</summary>
/// <remarks>
/// Inline sources carry the complete dataset. Host sources obtain query result pages from a host hook;
/// the host owns transport, query execution, and authorization. Both use the same column and cell definitions.
/// </remarks>
public sealed partial class CanopyDataGridView {
    private int? _rowHeight;
    private int _pageSize = 100;
    private int _pageLength = 50;
    private int? _searchDelayMilliseconds;
    private CanopyLabels _labels = new CanopyLabels();
    private CanopyGridSource _source = CanopyGridSource.Inline();
    private CanopyGridPresentation _presentation;

    /// <summary>Creates a flat-grid definition.</summary>
    /// <param name="id">The grid identity, unique within the page.</param>
    /// <param name="label">The accessible name.</param>
    public CanopyDataGridView(string id, string label) {
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

    /// <summary>Finds a declared column by its case-sensitive identity.</summary>
    /// <exception cref="KeyNotFoundException">No column has the requested identity.</exception>
    public CanopyColumn GetColumn(string id) {
        foreach (var column in Columns) if (column != null && column.Id == id) return column;
        throw new KeyNotFoundException("Unknown column: " + id);
    }

    /// <summary>Gets or sets optional reporting capabilities. Null keeps the ordinary data-grid entry point.</summary>
    public CanopyGridReporting? Reporting { get; set; }

    /// <summary>Gets all rows of an inline source. Host sources must leave this collection empty.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Gets at most 64 ordered raw-value highlight rules. The first match wins independently for the row and each condition cell.</summary>
    public IList<CanopyGridHighlightRule> HighlightRules { get; } = new List<CanopyGridHighlightRule>();

    /// <summary>Gets or sets whether rows come from the complete inline dataset or a host query hook.</summary>
    public CanopyGridSource Source {
        get => _source;
        set {
            _source = value ?? throw new ArgumentNullException(nameof(value));
            if (_source.Navigation == CanopyGridNavigation.Cursor) _presentation = CanopyGridPresentation.Paged;
        }
    }

    /// <summary>Gets the navigation contract selected by Source.</summary>
    /// <remarks>Cursor traversal requires a hosted, paged view and does not expose random page jumps.</remarks>
    public CanopyGridNavigation Navigation => Source.Navigation;

    /// <summary>Gets or sets continuous scrolling or paged presentation.</summary>
    public CanopyGridPresentation Presentation {
        get => _presentation;
        set {
            if (!Enum.IsDefined(typeof(CanopyGridPresentation), value)) throw new ArgumentOutOfRangeException(nameof(value));
            if (Navigation == CanopyGridNavigation.Cursor && value != CanopyGridPresentation.Paged)
                throw new InvalidOperationException("Cursor sources require paged presentation.");
            _presentation = value;
        }
    }

    /// <summary>Gets the pager settings of a paged grid: page-size choices, which controls show, numbered pages and the result text.</summary>
    /// <remarks>Left at their defaults they keep the built-in pager. Continuous grids ignore them.</remarks>
    public CanopyGridPager Pager { get; } = new CanopyGridPager();

    /// <summary>Whether the view writes pager settings, which the browser's pager part reads.</summary>
    internal bool HasPager => Presentation == CanopyGridPresentation.Paged && !Pager.IsDefault;

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

    /// <summary>Gets the per-control toolbar switches: Filters, Columns, Views, Export, the more menu and the result count. All default to on.</summary>
    public CanopyGridToolbar Toolbar { get; } = new CanopyGridToolbar();

    /// <summary>Gets the identities of the export formats the Export menu offers, in this order, after the built-in CSV.</summary>
    /// <remarks>Each identity names a format the page registers in the browser with <c>CanopyX.registerExportFormat</c>; an identity no page registers is skipped. Empty writes nothing, which offers every registered format; a browser host that offers none passes an empty <c>exportFormats</c> option, which takes precedence over this list. Identities are 1 to 32 lowercase letters, digits and hyphens, starting with a letter; <c>csv</c> is built in.</remarks>
    public IList<string> ExportFormats { get; } = new List<string>();

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
        if (!Toolbar.IsDefault) { writer.Name("toolbar"); Toolbar.WriteJson(writer); }
        if (ExportFormats.Count > 0) {
            writer.Name("exportFormats").BeginArray();
            foreach (var format in ExportFormats) writer.String(format);
            writer.EndArray();
        }
        if (AutoRowHeight) writer.Property("autoRowHeight", true);
        WriteRowPresentationJson(writer);
        writer.Property("pageSize", PageSize)
            .Property("selection", CanopyJsonNames.Selection(Selection)).Property("search", Search)
            .Name("columns").BeginArray();
        foreach (var column in Columns) {
            column.WriteJson(writer, grid: true);
        }
        writer.EndArray();
        if (HighlightRules.Count > 0) {
            writer.Name("highlightRules").BeginArray();
            foreach (var rule in HighlightRules) rule.WriteJson(writer);
            writer.EndArray();
        }
        if (Reporting != null) { writer.Name("reporting"); Reporting.WriteJson(writer, Columns); }
        if (Presentation == CanopyGridPresentation.Paged) writer.Property("presentation", "paged").Property("pageLength", PageLength);
        if (HasPager) { writer.Name("pager"); Pager.WriteJson(writer); }
        if (SearchDelayMilliseconds.HasValue) writer.Property("searchDelayMs", SearchDelayMilliseconds.Value);
        if (SearchColumns.Count > 0) {
            writer.Name("searchColumns").BeginArray();
            foreach (var column in SearchColumns) writer.String(column);
            writer.EndArray();
        }
        writer.Name("source").BeginObject().Property("kind", Source.Kind == CanopyGridSourceKind.Inline ? "inline" : "host")
            .Property("navigation", Navigation == CanopyGridNavigation.Cursor ? "cursor" : "offset").EndObject();
        writer.OptionalProperty("stateKey", StateKey).OptionalProperty("timeZone", CanopyJsonNames.TimeZone(TimeZone));
        if (Query != null) {
            writer.Name("query");
            Query.WriteJson(writer, this);
        }
        if (Labels.HasRuntimeLabels(false)) {
            writer.Name("labels");
            Labels.WriteJson(writer, false);
        }
        if (Source.Kind == CanopyGridSourceKind.Inline) {
            writer.Name("rows").BeginArray();
            foreach (var row in Rows) row.WriteJson(writer);
            writer.EndArray();
        }
        return writer.EndObject().ToString();
    }

    /// <summary>Validates column identities, values, query bindings and supported capability combinations.</summary>
    /// <remarks>Definitions remain editable. Call this after construction for early diagnostics; output validates again.</remarks>
    /// <exception cref="InvalidOperationException">The definition contains incompatible policies or data.</exception>
    /// <exception cref="ArgumentOutOfRangeException">An enum or option is outside its supported values.</exception>
    public void Validate() => ValidateColumns();

    internal HashSet<string> ValidateColumns() {
        if (Source.Kind != CanopyGridSourceKind.Inline && Source.Kind != CanopyGridSourceKind.Host) {
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
        if (Navigation == CanopyGridNavigation.Cursor && (Source.Kind != CanopyGridSourceKind.Host || Presentation != CanopyGridPresentation.Paged))
            throw new InvalidOperationException("Cursor navigation requires a hosted, paged grid.");
        CanopyJsonNames.TimeZone(TimeZone);
        if (Presentation == CanopyGridPresentation.Paged) Pager.Validate(Source.Kind);
        ValidateRowPresentation();
        var columnIds = new HashSet<string>(StringComparer.Ordinal);
        var visible = 0; var rowHeaders = 0;
        foreach (var column in Columns) {
            if (column == null || !columnIds.Add(column.Id)) throw new InvalidOperationException("Grid columns must have unique identities and cannot be null.");
            CanopyJsonNames.ColumnKind(column.Kind);
            if (column.Editable) throw new InvalidOperationException("Flat-grid editing is host composition; grid definitions do not expose edit proposals.");
            column.Presenter?.Validate(column, Columns);
            if (column.Aggregatable && column.Kind != CanopyColumnKind.Number) throw new InvalidOperationException("Status aggregates require numeric columns.");
            if (column.Section != null && (string.IsNullOrWhiteSpace(column.Section) || column.Section.Length > 256)) throw new InvalidOperationException("Drawer sections require bounded nonblank labels.");
            column.ValidateLayout(Columns);
            if (column.Ordering != null && (Reporting == null || !column.Sortable || column.Kind != CanopyColumnKind.Text))
                throw new InvalidOperationException("Ordering requires reporting capabilities and a sortable text column.");
            if (column.RowHeader && ++rowHeaders > 1) throw new InvalidOperationException("A grid has at most one row header column.");
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
        var formats = new HashSet<string>(StringComparer.Ordinal);
        foreach (var format in ExportFormats) {
            if (!IsExportFormatId(format) || !formats.Add(format)) throw new InvalidOperationException("Export formats must be unique identities of 1 to 32 lowercase letters, digits and hyphens, starting with a letter; csv is built in.");
        }
        if (Source.Kind == CanopyGridSourceKind.Host && Rows.Count != 0) throw new InvalidOperationException("A host grid obtains its rows from the host query hook; inline rows must be empty.");
        CanopyGridRows.Validate(Rows, columnIds, Columns);
        Query?.Validate(this);
        return columnIds;
    }

    internal static bool IsExportFormatId(string? id) {
        if (id == null || id.Length == 0 || id.Length > 32 || id[0] < 'a' || id[0] > 'z' || id == "csv") return false;
        foreach (var character in id) {
            if (!(character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '-')) return false;
        }

        return true;
    }
}
