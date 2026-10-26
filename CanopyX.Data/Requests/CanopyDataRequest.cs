using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

/// <summary>A validated full-dataset query and result window, ready for a data provider.</summary>
/// <remarks>
/// A provider applies, in this order: the optional identity restriction (<see cref="Ids"/> and <see cref="ExcludedIds"/>),
/// quick search (<see cref="SearchTerms"/>, every term matching at least one searchable column), the filter expression,
/// the grouping levels (<see cref="Levels"/>), the other sort keys followed by stable record identity, and finally the
/// window (<see cref="Offset"/>, <see cref="Limit"/>).
/// Instances are immutable; the <c>With…</c> methods return copies.
/// </remarks>
public sealed partial class CanopyDataRequest {
    private static readonly Regex Words = new Regex("\"([^\"]*)(?:\"|$)|([^\\s\"]+)", RegexOptions.CultureInvariant);

    /// <summary>Creates a request.</summary>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="filter">The filter expression, or null for none.</param>
    /// <param name="sort">The ordered sort keys.</param>
    /// <param name="search">Quick-search text; null or empty for none.</param>
    /// <param name="searchMode">Substring or all-words matching.</param>
    /// <param name="offset">The nonnegative offset into the ordered matching records.</param>
    /// <param name="limit">The nonnegative maximum number of records to return.</param>
    /// <param name="revision">The dataset revision the client expects, or null for the current one.</param>
    /// <param name="levels">The grouping levels, outermost first (at most four, distinct allowed columns). Null uses the schema's
    /// fixed grouping or declared <c>groupBy</c> levels; an empty sequence is ungrouped.</param>
    public CanopyDataRequest(CanopyDataSchema schema, CanopyFilterNode? filter = null, IEnumerable<CanopySortKey>? sort = null, string? search = null,
        CanopyGridSearchMode searchMode = CanopyGridSearchMode.Substring, int offset = 0, int limit = 100, string? revision = null,
        IEnumerable<CanopySummaryLevel>? levels = null) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        Levels = levels == null ? DefaultLevels(schema) : CheckLevels(schema, levels);
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (limit < 0) throw new ArgumentOutOfRangeException(nameof(limit));
        if (searchMode != CanopyGridSearchMode.Substring && searchMode != CanopyGridSearchMode.Words) throw new ArgumentOutOfRangeException(nameof(searchMode));
        Filter = filter;
        var keys = new List<CanopySortKey>();
        if (sort != null) foreach (var key in sort) keys.Add(key ?? throw new ArgumentException("Sort keys cannot be null.", nameof(sort)));
        var fixedKeys = new List<CanopySortKey>();
        var fixedColumns = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in schema.ProtocolView.PreSort) { fixedKeys.Add(new CanopySortKey(schema.GetColumn(key.Column), key.Descending)); fixedColumns.Add(key.Column); }
        fixedKeys.AddRange(keys.FindAll(key => !fixedColumns.Contains(key.Column.Id)));
        Sort = new ReadOnlyCollection<CanopySortKey>(fixedKeys);
        Search = search ?? string.Empty;
        SearchMode = searchMode;
        SearchTerms = SplitTerms(Search, searchMode);
        Offset = offset;
        Limit = limit;
        Revision = revision;
        ExcludedIds = Array.Empty<string>();
    }

    private CanopyDataRequest(CanopyDataRequest source) {
        Schema = source.Schema; Filter = source.Filter; Sort = source.Sort; Search = source.Search; SearchMode = source.SearchMode;
        SearchTerms = source.SearchTerms; Offset = source.Offset; Limit = source.Limit; Revision = source.Revision;
        Ids = source.Ids; ExcludedIds = source.ExcludedIds; RawQuery = source.RawQuery; Levels = source.Levels;
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

    /// <summary>Gets the grouping levels, outermost first; empty when the request is ungrouped.</summary>
    /// <remarks>
    /// Records are ordered level by level before the remaining sort keys: by each level's value, or for a level with an
    /// aggregate by that aggregate over the group, as <see cref="CanopySummaryLevel"/> describes. The levels' columns also lead
    /// <see cref="Sort"/>, as they do on the wire; providers order by the levels and then by the sort keys of other columns.
    /// </remarks>
    public IReadOnlyList<CanopySummaryLevel> Levels { get; private set; }

    /// <summary>The sort keys that apply inside the innermost groups: <see cref="Sort"/> without the grouping columns.</summary>
    internal IReadOnlyList<CanopySortKey> InnerSort {
        get {
            if (Levels.Count == 0) return Sort;
            var keys = new List<CanopySortKey>();
            foreach (var key in Sort) {
                var grouped = false;
                foreach (var level in Levels) grouped |= level.Column.Id == key.Column.Id;
                if (!grouped) keys.Add(key);
            }
            return keys;
        }
    }

    /// <summary>Gets the dataset revision the client expects, or null for the current one.</summary>
    public string? Revision { get; private set; }

    /// <summary>Gets the quick-search text exactly as requested.</summary>
    public string Search { get; private set; }

    /// <summary>Gets the search mode.</summary>
    public CanopyGridSearchMode SearchMode { get; private set; }

    /// <summary>Gets the unfolded search terms: the whole text in substring mode, or each word and quoted phrase in words mode.</summary>
    /// <remarks>Each term must match (case-insensitively, as a substring) at least one searchable column of a record.</remarks>
    public IReadOnlyList<string> SearchTerms { get; private set; }

    /// <summary>Gets the filter expression, or null when every record matches.</summary>
    public CanopyFilterNode? Filter { get; private set; }

    /// <summary>Gets accepted column aliases, including fixed pre-sort keys. Their definitions retain OrderData and SortComparator intent for host providers.</summary>
    /// <remarks>Built-in providers expand OrderData once, after grouping and fixed keys, and append stable record identity as the final key.</remarks>
    public IReadOnlyList<CanopySortKey> Sort { get; private set; }

    /// <summary>Gets the offset into the ordered matching records.</summary>
    public int Offset { get; private set; }

    /// <summary>Gets the maximum number of records to return.</summary>
    public int Limit { get; private set; }

    /// <summary>Gets record identities the result is restricted to, or null for no restriction.</summary>
    public IReadOnlyCollection<string>? Ids { get; private set; }

    /// <summary>Gets record identities excluded from the result.</summary>
    public IReadOnlyCollection<string> ExcludedIds { get; private set; }

    /// <summary>The original validated predicate shape and operands, retained when normalizing a summary query echo.</summary>
    internal string? RawQuery { get; private set; }

    /// <summary>Returns a copy with another window.</summary>
    /// <param name="offset">The nonnegative offset.</param>
    /// <param name="limit">The nonnegative limit.</param>
    /// <returns>The copy.</returns>
    public CanopyDataRequest WithWindow(int offset, int limit) {
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (limit < 0) throw new ArgumentOutOfRangeException(nameof(limit));
        return new CanopyDataRequest(this) { Offset = offset, Limit = limit };
    }

    /// <summary>Returns a copy restricted to, or excluding, explicit record identities.</summary>
    /// <param name="ids">Identities to restrict to, or null for no restriction.</param>
    /// <param name="excludedIds">Identities to exclude, or null for none.</param>
    /// <returns>The copy.</returns>
    public CanopyDataRequest WithIdentities(IEnumerable<string>? ids, IEnumerable<string>? excludedIds) => new CanopyDataRequest(this) {
        Ids = ids == null ? null : new ReadOnlyCollection<string>(new List<string>(new HashSet<string>(ids, StringComparer.Ordinal))),
        ExcludedIds = excludedIds == null ? Array.Empty<string>() : new ReadOnlyCollection<string>(new List<string>(new HashSet<string>(excludedIds, StringComparer.Ordinal)))
    };

    /// <summary>Returns a copy without search and filters, keeping the sort keys and window.</summary>
    /// <returns>The copy.</returns>
    public CanopyDataRequest WithoutCriteria() => new CanopyDataRequest(this) {
        Filter = null, Search = string.Empty, SearchTerms = Array.Empty<string>(), RawQuery = null
    };

    internal CanopyDataRequest WithFilter(CanopyFilterNode? filter) => new CanopyDataRequest(this) { Filter = filter, RawQuery = null };

    internal CanopyDataRequest WithRaw(string raw) => new CanopyDataRequest(this) { RawQuery = raw };

    internal CanopyDataRequest WithSort(IReadOnlyList<CanopySortKey> sort) => new CanopyDataRequest(this) { Sort = sort };

    private static IReadOnlyList<CanopySummaryLevel> DefaultLevels(CanopyDataSchema schema) {
        if (schema.Grouping != null) return new[] { new CanopySummaryLevel(schema.GetColumn(schema.Grouping.Column), schema.Grouping.Descending) };
        var levels = new List<CanopySummaryLevel>();
        foreach (var level in schema.GroupBy)
            levels.Add(new CanopySummaryLevel(schema.GetColumn(level.Column), level.Descending, level.Aggregate == null ? null : schema.FindAggregate(level.Aggregate)));
        return new ReadOnlyCollection<CanopySummaryLevel>(levels);
    }

    private static IReadOnlyList<CanopySummaryLevel> CheckLevels(CanopyDataSchema schema, IEnumerable<CanopySummaryLevel> levels) {
        var list = new List<CanopySummaryLevel>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var level in levels) {
            if (level == null || !schema.TryGetColumn(level.Column.Id, out var column) || !ReferenceEquals(column, level.Column) || !seen.Add(column.Id))
                throw new ArgumentException("Grouping levels need distinct columns of this schema.", nameof(levels));
            if (level.Aggregate != null && !ReferenceEquals(schema.FindAggregate(level.Aggregate.Id), level.Aggregate))
                throw new ArgumentException("A grouping level orders by a declared aggregate of this schema.", nameof(levels));
            list.Add(level);
        }
        if (list.Count > 4) throw new ArgumentException("At most four grouping levels are supported.", nameof(levels));
        return new ReadOnlyCollection<CanopySummaryLevel>(list);
    }

    internal static IReadOnlyList<string> SplitTerms(string text, CanopyGridSearchMode mode) {
        if (text.Length == 0) return Array.Empty<string>();
        if (mode != CanopyGridSearchMode.Words) return new[] { text };
        // Repeated terms add nothing to an all-terms match, so each distinct term is kept once.
        var terms = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match match in Words.Matches(text)) {
            var term = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            if (term.Length > 0 && seen.Add(term)) terms.Add(term);
        }
        return new ReadOnlyCollection<string>(terms);
    }
}
