using System;

namespace CanopyX.Data;

/// <summary>A validated value-list (facet) request: distinct values of one column with counts over the complete query.</summary>
/// <remarks>
/// The window and sort of <see cref="Query"/> do not apply. <see cref="Query"/> already carries the effective filter:
/// when <see cref="IncludeCurrentFilter"/> is false every predicate on <see cref="Column"/> was replaced by true,
/// including inside OR groups. Text buckets are case-insensitive; null values form one bucket that sorts last.
/// </remarks>
public sealed class CanopyFacetRequest {
    /// <summary>Creates an unbucketed facet request, preserving the released constructor signature.</summary>
    /// <param name="query">The complete query with the effective filter.</param>
    /// <param name="column">The facet column.</param>
    /// <param name="search">The value search text, or null for none.</param>
    /// <param name="limit">The maximum number of buckets, at least one.</param>
    /// <param name="includeCurrentFilter">Whether predicates on this column still apply.</param>
    public CanopyFacetRequest(CanopyDataRequest query, CanopyDataColumn column, string? search, int limit, bool includeCurrentFilter)
        : this(query, column, search, limit, includeCurrentFilter, null) { }

    /// <summary>Creates a value-list request.</summary>
    /// <param name="query">The complete query with the effective filter.</param>
    /// <param name="column">The facet column.</param>
    /// <param name="search">Case-insensitive substring search over the bucket values; empty for none.</param>
    /// <param name="limit">The most buckets to return, at least one.</param>
    /// <param name="includeCurrentFilter">Whether predicates on the facet column still apply.</param>
    /// <param name="bucket">Optional partition, with numeric keys.</param>
    public CanopyFacetRequest(CanopyDataRequest query, CanopyDataColumn column, string? search, int limit, bool includeCurrentFilter, CanopyBucket? bucket = null) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        Column = column ?? throw new ArgumentNullException(nameof(column));
        if (limit < 1) throw new ArgumentOutOfRangeException(nameof(limit));
        Search = search ?? string.Empty;
        Limit = limit;
        IncludeCurrentFilter = includeCurrentFilter;
        bucket?.Validate(column.Definition); Bucket = bucket;
    }

    /// <summary>Gets the complete query with the effective filter.</summary>
    public CanopyDataRequest Query { get; }

    /// <summary>Gets the facet column.</summary>
    public CanopyDataColumn Column { get; }
    /// <summary>Gets the optional partition applied before counting distinct values.</summary>
    public CanopyBucket? Bucket { get; }

    /// <summary>Gets the value search text, exactly as requested.</summary>
    public string Search { get; }

    /// <summary>Gets the most buckets to return.</summary>
    public int Limit { get; }

    /// <summary>Gets whether predicates on the facet column still apply.</summary>
    public bool IncludeCurrentFilter { get; }
}
