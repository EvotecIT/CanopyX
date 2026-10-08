using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The accepted full-dataset query and requested result window of a flat data grid.</summary>
/// <remarks>
/// Search, all flat column predicates and the optional nested group are combined with AND, followed by the ordered sort keys and a stable
/// ordinal row-identity tie-breaker. Missing values sort last in either direction. Paging is applied last.
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

    /// <summary>Gets or sets an optional bounded AND/OR expression, combined with search and flat predicates using AND.</summary>
    public CanopyGridFilterGroup? FilterGroup { get; set; }

    /// <summary>Gets the ordered sort keys. The runtime appends stable identity as the final tie-breaker.</summary>
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
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) columns.Add(column.Id, column);
        var sorted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sort in Sort) {
            if (sort == null || !columns.TryGetValue(sort.Column, out var column) || !column.Sortable || !sorted.Add(sort.Column)) {
                throw new InvalidOperationException("Sort keys must identify unique declared sortable columns.");
            }
        }
        foreach (var filter in Filters) {
            if (filter == null || !columns.TryGetValue(filter.Column, out var column)) throw new InvalidOperationException("Grid predicates must identify declared columns.");
            filter.Validate(column);
        }
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
        if (grouping != null) new CanopyGridSort(grouping.Column, grouping.Descending).WriteJson(writer);
        foreach (var sort in Sort) if (sort.Column != grouping?.Column) sort.WriteJson(writer);
        writer.EndArray().Name("filters").BeginArray();
        foreach (var filter in Filters) filter.WriteJson(writer);
        writer.EndArray();
        if (SearchMode == CanopyGridSearchMode.Words) writer.Property("searchMode", "words");
        if (FilterGroup != null) {
            writer.Name("filterGroup");
            FilterGroup.WriteJson(writer);
        }
        writer.EndObject();
    }
}
