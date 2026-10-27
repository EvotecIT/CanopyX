using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The accepted full-dataset query and requested result window of a flat data grid.</summary>
/// <remarks>
/// Search, all flat column predicates and the optional nested group are combined with AND, followed by the ordered sort keys and a stable
/// row-identity tie-breaker (<see cref="CanopyRowIdentity.Compare"/>). Missing values sort last in either direction. Paging is applied last.
/// Host query engines implement this contract without transferring their domain logic to CanopyX.
/// </remarks>
public sealed class CanopyGridQuery {
    private int _offset;
    private int _limit = 100;

    /// <summary>Creates a query for a grid.</summary>
    /// <param name="view">The grid identity.</param>
    public CanopyGridQuery(string view) {
        CanopyIdentifiers.Require(view, nameof(view));
        View = view;
    }

    /// <summary>Gets the target grid identity.</summary>
    public string View { get; }

    /// <summary>Gets or sets search text over raw values of declared columns. Null is empty search.</summary>
    public string? Search { get; set; }

    /// <summary>Gets or sets substring or all-word/quoted-phrase matching. Existing queries default to substring matching.</summary>
    public CanopyGridSearchMode SearchMode { get; set; }

    /// <summary>Gets or sets the expected dataset snapshot identity. Null requests the current snapshot.</summary>
    public string? Revision { get; set; }

    /// <summary>Gets or sets an opaque host cursor. Null requests the first page of a cursor source.</summary>
    /// <remarks>Cursor requests contain no random-access offset. Offset sources reject this property.</remarks>
    public string? Cursor { get; set; }

    /// <summary>Gets the AND-combined typed column predicates.</summary>
    public IList<CanopyGridFilter> Filters { get; } = new List<CanopyGridFilter>();

    /// <summary>Gets up to eight AND-combined exact tuple predicates, used for correlated drill-through scopes.</summary>
    public IList<CanopyGridTupleFilter> TupleFilters { get; } = new List<CanopyGridTupleFilter>();

    /// <summary>Gets or sets an optional bounded AND/OR expression, combined with search and flat predicates using AND.</summary>
    public CanopyGridFilterGroup? FilterGroup { get; set; }

    /// <summary>Gets or sets the runtime grouping levels of a definition with <see cref="CanopyGridReporting.GroupBy"/> or
    /// <see cref="CanopyGridReporting.Groupable"/>. Null uses the definition's declared levels; an empty list is ungrouped.</summary>
    /// <remarks>The levels' columns lead the written sort (ascending for a level ordered by an aggregate); other sorts follow.</remarks>
    public IList<CanopyGridGroupLevel>? GroupBy { get; set; }

    /// <summary>The grouping levels this query applies: its own, or the definition's declared levels.</summary>
    internal IList<CanopyGridGroupLevel> Levels(CanopyDataGridView view) => GroupBy ?? view.Reporting?.GroupBy ?? (IList<CanopyGridGroupLevel>)Array.Empty<CanopyGridGroupLevel>();

    /// <summary>Gets ordered column aliases. OrderData is resolved by the query engine; the wire retains aliases and the runtime appends stable identity as the final tie-breaker.</summary>
    public IList<CanopyGridSort> Sort { get; } = new List<CanopyGridSort>();

    /// <summary>Gets or sets the nonnegative offset into ordered matching rows. Cursor sources require zero and omit this field.</summary>
    public int Offset {
        get => _offset;
        set {
            if (value < 0) throw new ArgumentOutOfRangeException(nameof(value));
            _offset = value;
        }
    }

    /// <summary>Gets or sets the requested window size, between 1 and 10,000.</summary>
    public int Limit {
        get => _limit;
        set {
            if (value < 1 || value > 10000) throw new ArgumentOutOfRangeException(nameof(value));
            _limit = value;
        }
    }

    /// <summary>Writes the HTML-safe <c>gridQuery</c> or <c>gridCursorQuery</c> document after checking its column bindings.</summary>
    /// <param name="view">The grid definition that owns these columns.</param>
    /// <returns>The query request.</returns>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var writer = new CanopyJsonWriter();
        WriteJson(writer, view);
        return writer.ToString();
    }

    internal void Validate(CanopyDataGridView view) {
        if (SearchMode != CanopyGridSearchMode.Substring && SearchMode != CanopyGridSearchMode.Words) throw new ArgumentOutOfRangeException(nameof(SearchMode));
        if (view.Id != View) throw new InvalidOperationException("A grid query must target its owning view.");
        if (Revision != null) CanopyIdentifiers.Require(Revision, nameof(Revision));
        CanopyGridCursors.Validate(Cursor, nameof(Cursor));
        if (Cursor != null && Revision == null) throw new InvalidOperationException("A cursor requires its dataset revision.");
        if (view.Navigation == CanopyGridNavigation.Cursor ? Offset != 0 : Cursor != null)
            throw new InvalidOperationException("Cursor queries cannot request offsets; offset queries cannot request cursors.");
        if (Filters.Count > 64) throw new InvalidOperationException("A grid query supports at most 64 column predicates.");
        if (TupleFilters.Count > 8) throw new InvalidOperationException("A grid query supports at most eight tuple predicates.");
        foreach (var tuple in TupleFilters) {
            if (tuple == null) throw new InvalidOperationException("A tuple predicate cannot be null.");
            tuple.Validate(view.GetColumn);
        }
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) columns.Add(column.Id, column);
        var sorted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sort in Sort) {
            if (sort == null || !columns.TryGetValue(sort.Column, out var column) || !column.Sortable || !sorted.Add(sort.Column)) {
                throw new InvalidOperationException("Sort keys must identify unique declared sortable columns.");
            }
        }
        foreach (var filter in Filters) {
            if (filter == null || !columns.TryGetValue(filter.Column, out var column) || !column.Filterable) throw new InvalidOperationException("Grid predicates must identify declared filterable columns.");
            filter.Validate(column);
        }
        if (GroupBy != null && view.Reporting?.DynamicGrouping != true) throw new InvalidOperationException("Grouping levels need a definition with runtime grouping.");
        if (GroupBy != null) view.Reporting!.ValidateLevels(GroupBy, view.Columns);
        var predicates = Filters.Count;
        var groups = 0;
        FilterGroup?.Validate(columns, 1, ref predicates, ref groups);
    }

    internal void WriteJson(CanopyJsonWriter writer, CanopyDataGridView view) {
        Validate(view);
        var cursor = view.Navigation == CanopyGridNavigation.Cursor;
        writer.BeginObject().Envelope(cursor ? "gridCursorQuery" : "gridQuery").Property("view", View);
        if (cursor) writer.OptionalProperty("cursor", Cursor); else writer.Property("offset", Offset);
        writer.Property("limit", Limit).Property("search", Search ?? string.Empty).OptionalProperty("revision", Revision).Name("sort").BeginArray();
        var grouping = view.Reporting?.Grouping;
        var levels = Levels(view);
        var leading = new HashSet<string>(StringComparer.Ordinal);
        if (grouping != null) { new CanopyGridSort(grouping.Column, grouping.Descending).WriteJson(writer); leading.Add(grouping.Column); }
        foreach (var level in levels) { new CanopyGridSort(level.Column, level.Aggregate == null && level.Descending).WriteJson(writer); leading.Add(level.Column); }
        foreach (var sort in view.PreSort) if (leading.Add(sort.Column)) sort.WriteJson(writer);
        foreach (var sort in Sort) if (leading.Add(sort.Column)) sort.WriteJson(writer);
        writer.EndArray().Name("filters").BeginArray();
        foreach (var filter in Filters) filter.WriteJson(writer);
        writer.EndArray();
        if (TupleFilters.Count > 0) {
            writer.Name("tupleFilters").BeginArray(); foreach (var tuple in TupleFilters) tuple.WriteJson(writer); writer.EndArray();
        }
        if (SearchMode == CanopyGridSearchMode.Words) writer.Property("searchMode", "words");
        if (view.Reporting?.DynamicGrouping == true) { writer.Name("groupBy").BeginArray(); foreach (var level in levels) level.WriteJson(writer); writer.EndArray(); }
        if (FilterGroup != null) {
            writer.Name("filterGroup");
            FilterGroup.WriteJson(writer);
        }
        writer.EndObject();
    }
}
