using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>The allow-list of columns a remote grid endpoint serves, bound to its grid definition.</summary>
/// <remarks>
/// A request may only reference columns in this schema. Declared view columns that are not allowed stay display-only:
/// a request that sorts, filters or exports them is rejected. The schema copies the declared column order, sortability,
/// search columns, facet columns, grouping and aggregates when it is created; later changes to the view do not apply.
/// </remarks>
public sealed class CanopyDataSchema {
    private readonly Dictionary<string, CanopyDataColumn> _byId = new Dictionary<string, CanopyDataColumn>(StringComparer.Ordinal);

    /// <summary>Creates a schema over a hosted offset grid.</summary>
    /// <param name="view">The grid definition the browser renders.</param>
    /// <param name="columns">The allowed column identities. Null allows every declared column.</param>
    /// <param name="notFilterable">Allowed columns that requests may read and sort but not filter on.</param>
    /// <exception cref="ArgumentException">The view uses cursor navigation, or a column is not declared.</exception>
    public CanopyDataSchema(CanopyDataGridView view, IEnumerable<string>? columns = null, IEnumerable<string>? notFilterable = null) {
        View = view ?? throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (view.Navigation != CanopyGridNavigation.Offset)
            throw new ArgumentException("The remote data adapter serves offset navigation; cursor views are not supported.", nameof(view));
        var allowed = columns == null ? null : new HashSet<string>(columns, StringComparer.Ordinal);
        var locked = notFilterable == null ? new HashSet<string>(StringComparer.Ordinal) : new HashSet<string>(notFilterable, StringComparer.Ordinal);
        var declared = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in view.Columns) declared.Add(column.Id);
        if (allowed != null) foreach (var id in allowed) if (!declared.Contains(id)) throw new ArgumentException("Column '" + id + "' is not declared by view '" + view.Id + "'.", nameof(columns));
        foreach (var id in locked) if (!declared.Contains(id)) throw new ArgumentException("Column '" + id + "' is not declared by view '" + view.Id + "'.", nameof(notFilterable));
        var explicitSearch = new HashSet<string>(view.SearchColumns, StringComparer.Ordinal);
        var facets = new HashSet<string>(view.Reporting?.FacetColumns ?? (IEnumerable<string>)Array.Empty<string>(), StringComparer.Ordinal);
        var list = new List<CanopyDataColumn>();
        var search = new List<CanopyDataColumn>();
        foreach (var definition in view.Columns) {
            if (allowed != null && !allowed.Contains(definition.Id)) continue;
            var listed = explicitSearch.Contains(definition.Id);
            var column = new CanopyDataColumn(definition, list.Count, !locked.Contains(definition.Id), explicitSearch.Count == 0 || listed, listed, facets.Contains(definition.Id));
            list.Add(column);
            _byId.Add(column.Id, column);
            if (column.Searchable) search.Add(column);
        }
        if (list.Count == 0) throw new ArgumentException("A remote schema needs at least one allowed column.", nameof(columns));
        Columns = new ReadOnlyCollection<CanopyDataColumn>(list);
        SearchColumns = new ReadOnlyCollection<CanopyDataColumn>(search);
        Grouping = view.Reporting?.Grouping;
        if (Grouping != null && !_byId.ContainsKey(Grouping.Column))
            throw new ArgumentException("The grouping column '" + Grouping.Column + "' must be allowed.", nameof(columns));
        var aggregates = new List<CanopyGridAggregate>();
        if (view.Reporting != null) foreach (var aggregate in view.Reporting.Aggregates) {
            if (!_byId.ContainsKey(aggregate.Column)) throw new ArgumentException("The aggregate column '" + aggregate.Column + "' must be allowed.", nameof(columns));
            aggregates.Add(aggregate);
        }
        Aggregates = new ReadOnlyCollection<CanopyGridAggregate>(aggregates);
    }

    /// <summary>Gets the grid definition.</summary>
    public CanopyDataGridView View { get; }

    /// <summary>Gets the grid identity.</summary>
    public string ViewId => View.Id;

    /// <summary>Gets the allowed columns in declared order.</summary>
    public IReadOnlyList<CanopyDataColumn> Columns { get; }

    /// <summary>Gets the allowed columns quick search reads.</summary>
    public IReadOnlyList<CanopyDataColumn> SearchColumns { get; }

    /// <summary>Gets the fixed grouping of the view, if any.</summary>
    public CanopyGridGrouping? Grouping { get; }

    /// <summary>Gets the declared aggregates of the view.</summary>
    public IReadOnlyList<CanopyGridAggregate> Aggregates { get; }

    /// <summary>Gets whether the view requests complete-query summaries (grouping or aggregates).</summary>
    public bool HasSummary => Grouping != null || Aggregates.Count > 0;

    /// <summary>Finds an allowed column.</summary>
    /// <param name="id">The column identity.</param>
    /// <param name="column">The column, when allowed.</param>
    /// <returns>True when the column is allowed.</returns>
    public bool TryGetColumn(string id, out CanopyDataColumn column) => _byId.TryGetValue(id ?? string.Empty, out column!);

    /// <summary>Gets an allowed column.</summary>
    /// <param name="id">The column identity.</param>
    /// <returns>The column.</returns>
    /// <exception cref="CanopyRequestException">The column is not allowed.</exception>
    public CanopyDataColumn GetColumn(string id) {
        if (TryGetColumn(id, out var column)) return column;
        throw new CanopyRequestException(CanopyRequestError.UnknownColumn, "The column is not available on this endpoint.");
    }
}
