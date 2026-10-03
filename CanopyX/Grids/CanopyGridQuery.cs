using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The accepted full-dataset query and requested result window of a flat data grid.</summary>
/// <remarks>
/// Search and all column predicates are combined with AND, followed by the ordered sort keys and a stable
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

    /// <summary>Gets or sets the expected dataset snapshot identity. Null requests the current snapshot.</summary>
    public string? Revision { get; set; }

    /// <summary>Gets the AND-combined typed column predicates.</summary>
    public IList<CanopyGridFilter> Filters { get; } = new List<CanopyGridFilter>();

    /// <summary>Gets the ordered sort keys. The runtime appends stable identity as the final tie-breaker.</summary>
    public IList<CanopyGridSort> Sort { get; } = new List<CanopyGridSort>();

    /// <summary>Gets or sets the nonnegative offset into ordered matching rows.</summary>
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

    /// <summary>Writes the HTML-safe <c>gridQuery</c> document after checking its column bindings.</summary>
    /// <param name="view">The grid definition that owns these columns.</param>
    /// <returns>The query request.</returns>
    public string ToJson(CanopyGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var writer = new CanopyJsonWriter();
        WriteJson(writer, view);
        return writer.ToString();
    }

    internal void Validate(CanopyGridView view) {
        if (view.Id != View) throw new InvalidOperationException("A grid query must target its owning view.");
        if (Revision != null) CanopyIdentifiers.Require(Revision, nameof(Revision));
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
    }

    internal void WriteJson(CanopyJsonWriter writer, CanopyGridView view) {
        Validate(view);
        writer.BeginObject().Envelope("gridQuery").Property("view", View).Property("offset", Offset).Property("limit", Limit)
            .Property("search", Search ?? string.Empty).OptionalProperty("revision", Revision).Name("sort").BeginArray();
        foreach (var sort in Sort) sort.WriteJson(writer);
        writer.EndArray().Name("filters").BeginArray();
        foreach (var filter in Filters) filter.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
