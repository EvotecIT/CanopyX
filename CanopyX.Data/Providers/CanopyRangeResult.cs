using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>The records that overlap a date range: the overlapping count and the first records in start order.</summary>
public sealed class CanopyRangeResult {
    /// <summary>Creates a range result.</summary>
    /// <param name="matched">Records that overlap the window after the query's criteria and the resource restriction.</param>
    /// <param name="rows">The first of them, at most the request's limit, ordered by start and then record identity.</param>
    public CanopyRangeResult(int matched, IEnumerable<CanopyGridRow> rows) {
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        Matched = matched;
        Rows = new ReadOnlyCollection<CanopyGridRow>(new List<CanopyGridRow>(rows ?? throw new ArgumentNullException(nameof(rows))));
    }

    /// <summary>Gets the number of records that overlap the window.</summary>
    public int Matched { get; }

    /// <summary>Gets the returned records, in order.</summary>
    public IReadOnlyList<CanopyGridRow> Rows { get; }
}
