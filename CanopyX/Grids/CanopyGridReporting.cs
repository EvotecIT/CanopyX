using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Optional reporting capabilities carried by the reporting-grid runtime.</summary>
/// <remarks>Ordinary flat grids and trees do not include these optional presentation and query policies.</remarks>
public sealed class CanopyGridReporting {
    /// <summary>Gets or sets optional single-column flat grouping over the complete accepted query.</summary>
    public CanopyGridGrouping? Grouping { get; set; }

    /// <summary>Gets the initial runtime grouping levels, outermost first, at most four.</summary>
    /// <remarks>Runtime grouping travels in each query (<c>groupBy</c>); readers can change it (<see cref="Groupable"/>), and saved views keep it.
    /// It cannot be combined with the fixed <see cref="Grouping"/>.</remarks>
    public IList<CanopyGridGroupLevel> GroupBy { get; } = new List<CanopyGridGroupLevel>();

    /// <summary>Gets or sets whether readers can group by sortable columns: column menus, the group-by bar and dragged headers.</summary>
    public bool Groupable { get; set; }

    /// <summary>Gets or sets expandable detail rows under the records, or null for none.</summary>
    public CanopyGridDetail? Detail { get; set; }

    internal bool DynamicGrouping => GroupBy.Count != 0 || Groupable;

    /// <summary>Gets up to 32 generic full-query and full-group aggregate descriptors.</summary>
    public IList<CanopyGridAggregate> Aggregates { get; } = new List<CanopyGridAggregate>();

    /// <summary>Gets or sets whether rows expose selection checkboxes and explicit selection-scope controls.</summary>
    /// <remarks>Page, range and all-matching selection require multiple-row selection. All matching captures an accepted query and revision.</remarks>
    public bool SelectionControls { get; set; }

    /// <summary>Gets or sets the explicitly keyed browser preference storage. Default session.</summary>
    /// <remarks>A host-provided view store overrides browser storage. Local storage requires a nonempty view state key.</remarks>
    public CanopyGridViewStorage ViewStorage { get; set; }

    /// <summary>Gets or sets whether headers opt into column filtering. Every column menu offers Filter…; a filter button appears only on a filtered column.</summary>
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

    internal void Validate(IList<CanopyColumn> columns) {
        var headerTemplate = Grouping?.HeaderTemplate;
        if (headerTemplate != null && (string.IsNullOrWhiteSpace(headerTemplate) || headerTemplate.Length > 512))
            throw new InvalidOperationException("A group header template must be nonblank and at most 512 characters.");
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
                aggregate.Numeric && declared.Kind != CanopyColumnKind.Number)
                throw new InvalidOperationException("Aggregates need unique identities and declared raw columns; numeric operations require number columns.");
        }
        if (Grouping != null && DynamicGrouping) throw new InvalidOperationException("A fixed grouping cannot be combined with GroupBy or Groupable.");
        ValidateLevels(GroupBy, columns);
        Detail?.Validate();
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

    }

    internal void ValidateLevels(IList<CanopyGridGroupLevel> levels, IList<CanopyColumn> columns) {
        if (levels.Count > 4) throw new InvalidOperationException("At most four grouping levels are supported.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var level in levels) {
            CanopyColumn? column = null;
            if (level != null) foreach (var declared in columns) if (declared.Id == level.Column) column = declared;
            var aggregate = false;
            if (level?.Aggregate != null) foreach (var declared in Aggregates) if (declared.Id == level.Aggregate) aggregate = true;
            if (level == null || column == null || !column.Sortable || !seen.Add(level.Column) || level.Aggregate != null && !aggregate)
                throw new InvalidOperationException("Grouping levels need unique declared sortable columns and declared aggregates.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer, IList<CanopyColumn> columns) {
        writer.BeginObject();
        if (Grouping != null) { writer.Name("grouping"); Grouping.WriteJson(writer); }
        if (GroupBy.Count != 0) { writer.Name("groupBy").BeginArray(); foreach (var level in GroupBy) level.WriteJson(writer); writer.EndArray(); }
        if (Groupable) writer.Property("groupable", true);
        if (Detail != null) { writer.Name("detail"); Detail.WriteJson(writer); }
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
        var hasOrdering = false;
        foreach (var column in columns) if (column.Ordering != null) hasOrdering = true;
        if (hasOrdering) {
            writer.Name("ordering").BeginObject();
            foreach (var column in columns) if (column.Ordering != null) { writer.Name(column.Id); column.Ordering.WriteJson(writer); }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
