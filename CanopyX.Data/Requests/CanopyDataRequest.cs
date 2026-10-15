using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

/// <summary>A validated full-dataset query and result window, ready for a data provider.</summary>
/// <remarks>
/// A provider applies, in this order: the optional identity restriction (<see cref="Ids"/> and <see cref="ExcludedIds"/>),
/// quick search (<see cref="SearchTerms"/>, every term matching at least one searchable column), the filter expression,
/// the sort keys followed by stable record identity, and finally the window (<see cref="Offset"/>, <see cref="Limit"/>).
/// Instances are immutable; the <c>With…</c> methods return copies.
/// </remarks>
public sealed class CanopyDataRequest {
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
    public CanopyDataRequest(CanopyDataSchema schema, CanopyFilterNode? filter = null, IEnumerable<CanopySortKey>? sort = null, string? search = null,
        CanopyGridSearchMode searchMode = CanopyGridSearchMode.Substring, int offset = 0, int limit = 100, string? revision = null) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (limit < 0) throw new ArgumentOutOfRangeException(nameof(limit));
        if (searchMode != CanopyGridSearchMode.Substring && searchMode != CanopyGridSearchMode.Words) throw new ArgumentOutOfRangeException(nameof(searchMode));
        Filter = filter;
        var keys = new List<CanopySortKey>();
        if (sort != null) foreach (var key in sort) keys.Add(key ?? throw new ArgumentException("Sort keys cannot be null.", nameof(sort)));
        Sort = new ReadOnlyCollection<CanopySortKey>(keys);
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
        Ids = source.Ids; ExcludedIds = source.ExcludedIds; RawQuery = source.RawQuery;
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

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

    /// <summary>Gets the sort keys. Providers append stable record identity as the final key.</summary>
    public IReadOnlyList<CanopySortKey> Sort { get; private set; }

    /// <summary>Gets the offset into the ordered matching records.</summary>
    public int Offset { get; private set; }

    /// <summary>Gets the maximum number of records to return.</summary>
    public int Limit { get; private set; }

    /// <summary>Gets record identities the result is restricted to, or null for no restriction.</summary>
    public IReadOnlyCollection<string>? Ids { get; private set; }

    /// <summary>Gets record identities excluded from the result.</summary>
    public IReadOnlyCollection<string> ExcludedIds { get; private set; }

    /// <summary>The query object exactly as the client sent it, echoed by summary documents.</summary>
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
        Filter = null, Search = string.Empty, SearchTerms = Array.Empty<string>()
    };

    internal CanopyDataRequest WithFilter(CanopyFilterNode? filter) => new CanopyDataRequest(this) { Filter = filter };

    internal CanopyDataRequest WithRaw(string raw) => new CanopyDataRequest(this) { RawQuery = raw };

    internal CanopyDataRequest WithSort(IReadOnlyList<CanopySortKey> sort) => new CanopyDataRequest(this) { Sort = sort };

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
