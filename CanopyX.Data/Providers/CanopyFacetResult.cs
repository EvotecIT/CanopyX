using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>Distinct values of one column with their counts, as a bounded prefix in deterministic order.</summary>
public sealed class CanopyFacetResult {
    /// <summary>Creates a value list.</summary>
    /// <param name="matched">Records matching the effective query, before value search.</param>
    /// <param name="totalValues">Distinct values after value search, before the limit.</param>
    /// <param name="items">The returned buckets, in order.</param>
    public CanopyFacetResult(int matched, int totalValues, IEnumerable<CanopyFacetBucket> items) {
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        if (totalValues < 0) throw new ArgumentOutOfRangeException(nameof(totalValues));
        Matched = matched;
        TotalValues = totalValues;
        Items = new ReadOnlyCollection<CanopyFacetBucket>(new List<CanopyFacetBucket>(items ?? throw new ArgumentNullException(nameof(items))));
    }

    /// <summary>Gets the records matching the effective query, before value search.</summary>
    public int Matched { get; }

    /// <summary>Gets the distinct values after value search, before the limit.</summary>
    public int TotalValues { get; }

    /// <summary>Gets the returned buckets.</summary>
    public IReadOnlyList<CanopyFacetBucket> Items { get; }
}
