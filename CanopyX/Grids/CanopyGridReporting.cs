using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Optional reporting capabilities carried by the reporting-grid runtime.</summary>
/// <remarks>Ordinary flat grids and trees do not include these optional presentation and query policies.</remarks>
public sealed class CanopyGridReporting {
    /// <summary>Gets or sets optional single-column flat grouping over the complete accepted query.</summary>
    public CanopyGridGrouping? Grouping { get; set; }

    /// <summary>Gets up to 32 generic full-query and full-group aggregate descriptors.</summary>
    public IList<CanopyGridAggregate> Aggregates { get; } = new List<CanopyGridAggregate>();

    /// <summary>Gets or sets whether rows expose selection checkboxes and explicit selection-scope controls.</summary>
    /// <remarks>Page, range and all-matching selection require multiple-row selection. All matching captures an accepted query and revision.</remarks>
    public bool SelectionControls { get; set; }

    /// <summary>Gets or sets the explicitly keyed browser preference storage. Default session.</summary>
    /// <remarks>A host-provided view store overrides browser storage. Local storage requires a nonempty view state key.</remarks>
    public CanopyGridViewStorage ViewStorage { get; set; }

    /// <summary>Gets or sets whether each visible header offers a filter-editor button.</summary>
    /// <remarks>The editor queries all records; the button does not filter only the mounted rows.</remarks>
    public bool HeaderFilters { get; set; }

    /// <summary>Gets or sets whether the filter editor offers bounded nested all/any condition groups.</summary>
    /// <remarks>Groups reuse the existing query contract; ordinary predicates remain an outer conjunction.</remarks>
    public bool FilterGroups { get; set; }

    /// <summary>Gets the declared columns offering full-query raw value/count facets.</summary>
    /// <remarks>Host grids require an explicit source facet hook. Counts are never inferred from cached windows.</remarks>
    public IList<string> FacetColumns { get; } = new List<string>();

    /// <summary>Gets or sets whether headers offer pointer dragging and keyboard column move controls.</summary>
    public bool ColumnReorder { get; set; }

    /// <summary>Gets or sets whether low-priority columns are temporarily hidden to fit the viewport.</summary>
    /// <remarks>Hidden fields retain their full query and explicit export semantics and are available to host details.</remarks>
    public bool Responsive { get; set; }

    /// <summary>Gets or sets the minimum center width left by effective pinned groups, from 40 to 4096 CSS pixels.</summary>
    public int MinimumCenterWidth { get; set; } = 128;

    /// <summary>Gets immutable width, flex, pin and responsive retention policies keyed by declared column identities.</summary>
    public IDictionary<string, CanopyGridColumnLayout> Layout { get; } = new Dictionary<string, CanopyGridColumnLayout>(StringComparer.Ordinal);

    /// <summary>Gets immutable text ordering policies keyed by declared sortable text-column identities.</summary>
    public IDictionary<string, CanopyGridOrdering> Ordering { get; } = new Dictionary<string, CanopyGridOrdering>(StringComparer.Ordinal);

    /// <summary>Gets immutable safe presenters keyed by declared column identities.</summary>
    public IDictionary<string, CanopyGridPresenter> Presenters { get; } = new Dictionary<string, CanopyGridPresenter>(StringComparer.Ordinal);

    internal void Validate(IList<CanopyColumn> columns) {
        CanopyColumn? groupColumn = null;
        foreach (var column in columns) if (column.Id == Grouping?.Column) groupColumn = column;
        if (Grouping != null && (groupColumn == null || !groupColumn.Sortable))
            throw new InvalidOperationException("Grouping requires a declared sortable raw column.");
        if (Aggregates.Count > 32) throw new InvalidOperationException("At most 32 aggregates are supported.");
        var aggregateIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var aggregate in Aggregates) {
            CanopyColumn? declared = null;
            if (aggregate != null) foreach (var column in columns) if (column.Id == aggregate.Column) declared = column;
            if (aggregate == null || declared == null || !aggregateIds.Add(aggregate.Id) ||
                aggregate.Operation != CanopyGridAggregateOperation.Count && declared.Kind != CanopyColumnKind.Number)
                throw new InvalidOperationException("Aggregates need unique identities and declared raw columns; numeric operations require number columns.");
        }
        if (ViewStorage != CanopyGridViewStorage.Session && ViewStorage != CanopyGridViewStorage.Local)
            throw new ArgumentOutOfRangeException(nameof(ViewStorage));
        var facets = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in FacetColumns) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == id) declared = column;
            if (declared == null || !facets.Add(id)) throw new InvalidOperationException("Facet columns must be unique declared identities.");
        }
        if (MinimumCenterWidth < 40 || MinimumCenterWidth > 4096)
            throw new InvalidOperationException("MinimumCenterWidth must be from 40 to 4096 CSS pixels.");
        foreach (var pair in Layout) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || pair.Value == null || declared.HasExplicitWidth && (declared.Width < pair.Value.Minimum || declared.Width > pair.Value.Maximum))
                throw new InvalidOperationException("A layout needs a declared column whose initial width is within its non-null policy bounds.");
        }
        foreach (var pair in Ordering) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || declared.Kind != CanopyColumnKind.Text || !declared.Sortable || pair.Value == null)
                throw new InvalidOperationException("Reporting ordering must identify a sortable text column and a non-null policy.");
        }
        foreach (var pair in Presenters) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || pair.Value == null) throw new InvalidOperationException("A presenter needs a declared column and a non-null descriptor.");
            var presenter = pair.Value;
            if (presenter.Kind == CanopyGridPresenterKind.Progress && declared.Kind != CanopyColumnKind.Number ||
                (presenter.Kind == CanopyGridPresenterKind.Boolean || presenter.Kind == CanopyGridPresenterKind.List || presenter.Kind == CanopyGridPresenterKind.Link) && declared.Kind != CanopyColumnKind.Text)
                throw new InvalidOperationException("The presenter is incompatible with the column's raw value kind.");
            if (presenter.HrefColumn != null) {
                CanopyColumn? href = null;
                foreach (var column in columns) if (column.Id == presenter.HrefColumn) href = column;
                if (href == null || href.Kind != CanopyColumnKind.Text) throw new InvalidOperationException("A link destination needs a declared text column.");
            }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Grouping != null) { writer.Name("grouping"); Grouping.WriteJson(writer); }
        if (Aggregates.Count != 0) {
            writer.Name("aggregates").BeginArray(); foreach (var aggregate in Aggregates) aggregate.WriteJson(writer); writer.EndArray();
        }
        if (SelectionControls) writer.Property("selectionControls", true);
        if (ViewStorage == CanopyGridViewStorage.Local) writer.Property("viewStorage", "local");
        if (HeaderFilters) writer.Property("headerFilters", true);
        if (FilterGroups) writer.Property("filterGroups", true);
        if (FacetColumns.Count != 0) {
            writer.Name("facetColumns").BeginArray();
            foreach (var id in FacetColumns) writer.String(id);
            writer.EndArray();
        }
        if (ColumnReorder) writer.Property("columnReorder", true);
        if (Responsive) writer.Property("responsive", true);
        if (MinimumCenterWidth != 128) writer.Property("minimumCenterWidth", MinimumCenterWidth);
        if (Layout.Count != 0) {
            writer.Name("layout").BeginObject();
            foreach (var pair in Layout) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        if (Ordering.Count != 0) {
            writer.Name("ordering").BeginObject();
            foreach (var pair in Ordering) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        if (Presenters.Count != 0) {
            writer.Name("presenters").BeginObject();
            foreach (var pair in Presenters) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
