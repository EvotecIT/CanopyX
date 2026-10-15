using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>The allow-list of columns a remote grid endpoint serves, bound to its grid definition.</summary>
/// <remarks>
/// A request may only reference columns in this schema. Declared view columns that are not allowed stay display-only:
/// a request that sorts, filters or exports them is rejected. The schema copies the declared column order, sortability,
/// search columns, facet columns, grouping (fixed or runtime levels), aggregates and editable columns when it is created;
/// later changes to the view do not apply.
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
        var bindings = new List<CanopySummaryAggregate>();
        if (view.Reporting != null) foreach (var aggregate in view.Reporting.Aggregates) {
            if (!_byId.TryGetValue(aggregate.Column, out var column)) throw new ArgumentException("The aggregate column '" + aggregate.Column + "' must be allowed.", nameof(columns));
            aggregates.Add(aggregate);
            bindings.Add(new CanopySummaryAggregate(aggregate.Id, column, aggregate.Operation, aggregate.CustomOperation));
        }
        Aggregates = new ReadOnlyCollection<CanopyGridAggregate>(aggregates);
        SummaryAggregates = new ReadOnlyCollection<CanopySummaryAggregate>(bindings);
        var levels = new List<CanopyGridGroupLevel>();
        var leading = new HashSet<string>(StringComparer.Ordinal);
        if (view.Reporting != null) foreach (var level in view.Reporting.GroupBy) {
            if (level == null || !_byId.TryGetValue(level.Column, out var column)) throw new ArgumentException("The grouping level column '" + level?.Column + "' must be allowed.", nameof(columns));
            if (!column.Sortable || !leading.Add(column.Id) || level.Aggregate != null && FindAggregateIn(bindings, level.Aggregate) == null)
                throw new ArgumentException("Grouping levels need distinct sortable columns and declared aggregates.", nameof(view));
            levels.Add(level);
        }
        if (levels.Count > 4) throw new ArgumentException("At most four grouping levels are supported.", nameof(view));
        GroupBy = new ReadOnlyCollection<CanopyGridGroupLevel>(levels);
        Groupable = view.Reporting?.Groupable == true;
        if (Grouping != null && DynamicGrouping) throw new ArgumentException("A fixed grouping cannot be combined with runtime grouping.", nameof(view));
        var editable = new List<CanopyDataColumn>();
        foreach (var column in list) {
            if (!column.Editable) continue;
            editable.Add(column);
            // The server checks patterns with .NET's ECMAScript syntax; one it cannot compile fails here, not on the first commit.
            if (column.Validation?.Pattern != null) {
                try { CommitValidation.Compile(column.Validation.Pattern); }
                catch (ArgumentException error) { throw new ArgumentException("Column '" + column.Id + "' has a pattern the server cannot check.", nameof(view), error); }
            }
        }
        EditableColumns = new ReadOnlyCollection<CanopyDataColumn>(editable);
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

    /// <summary>Gets the declared runtime grouping levels, outermost first; queries without <c>groupBy</c> use them.</summary>
    public IReadOnlyList<CanopyGridGroupLevel> GroupBy { get; }

    /// <summary>Gets whether readers may group by any sortable column at runtime.</summary>
    public bool Groupable { get; }

    /// <summary>Gets whether the view groups at runtime: its queries carry <c>groupBy</c> levels (declared levels or <see cref="Groupable"/>).</summary>
    public bool DynamicGrouping => GroupBy.Count != 0 || Groupable;

    /// <summary>Gets whether the view requests complete-query summaries (grouping or aggregates).</summary>
    public bool HasSummary => Grouping != null || DynamicGrouping || Aggregates.Count > 0;

    /// <summary>Gets the allowed columns the view declares editable. Only these can be written through a commit.</summary>
    public IReadOnlyList<CanopyDataColumn> EditableColumns { get; }

    /// <summary>The declared aggregates bound to their allowed columns, shared by every request of this schema.</summary>
    internal IReadOnlyList<CanopySummaryAggregate> SummaryAggregates { get; }

    /// <summary>Gets a declared aggregate bound to its allowed column, for example to order a grouping level built in code.</summary>
    /// <param name="id">The declared aggregate identity.</param>
    /// <returns>The aggregate binding.</returns>
    /// <exception cref="ArgumentException">The view declares no such aggregate.</exception>
    public CanopySummaryAggregate GetAggregate(string id) =>
        FindAggregate(id ?? throw new ArgumentNullException(nameof(id))) ?? throw new ArgumentException("The view declares no aggregate '" + id + "'.", nameof(id));

    internal CanopySummaryAggregate? FindAggregate(string id) => FindAggregateIn(SummaryAggregates, id);

    private static CanopySummaryAggregate? FindAggregateIn(IEnumerable<CanopySummaryAggregate> aggregates, string id) {
        foreach (var aggregate in aggregates) if (aggregate.Id == id) return aggregate;
        return null;
    }

    /// <summary>The protocol's raw group order of a sortable column (<see cref="CanopyGridGrouping.CreateComparer"/>), built once per column and direction.</summary>
    internal IComparer<CanopyCell> GroupComparer(string column, bool descending) =>
        _comparers.GetOrAdd(column + (descending ? "\u0001desc" : "\u0001asc"), _ => new CanopyGridGrouping(column, descending).CreateComparer(View));

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, IComparer<CanopyCell>> _comparers =
        new System.Collections.Concurrent.ConcurrentDictionary<string, IComparer<CanopyCell>>(StringComparer.Ordinal);

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
