using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>One window of ordered matching records with the dataset and matching counts.</summary>
public sealed class CanopyPageResult {
    /// <summary>Creates a page result.</summary>
    /// <param name="total">Records in the dataset before search and filters.</param>
    /// <param name="matched">Records matching the request before the window.</param>
    /// <param name="rows">The records of the window, in order.</param>
    public CanopyPageResult(int total, int matched, IEnumerable<CanopyGridRow> rows) {
        if (total < 0) throw new ArgumentOutOfRangeException(nameof(total));
        if (matched < 0 || matched > total) throw new ArgumentOutOfRangeException(nameof(matched));
        Total = total;
        Matched = matched;
        Rows = new ReadOnlyCollection<CanopyGridRow>(new List<CanopyGridRow>(rows ?? throw new ArgumentNullException(nameof(rows))));
    }

    /// <summary>Gets the dataset size before search and filters.</summary>
    public int Total { get; }

    /// <summary>Gets the matching record count before the window.</summary>
    public int Matched { get; }

    /// <summary>Gets the records of the window.</summary>
    public IReadOnlyList<CanopyGridRow> Rows { get; }

    /// <summary>Gets host-computed footer values by footer and aggregate identity, including custom operations. Omitted values remain unavailable.</summary>
    public IDictionary<string, IDictionary<string, double?>> FooterValues { get; } = new Dictionary<string, IDictionary<string, double?>>(StringComparer.Ordinal);
}
