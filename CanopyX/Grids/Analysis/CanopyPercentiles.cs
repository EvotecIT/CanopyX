using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The median and percentile method every CanopyX surface shares (the browser runtime computes the same way): the rank
/// <c>(n - 1) * p / 100</c> of the ascending values, interpolated linearly between the closest ranks, as Excel PERCENTILE.INC and
/// NumPy's default do. Missing values never reach it; no values produce null.</summary>
internal static class CanopyPercentiles {
    /// <summary>Interpolates over values sorted ascending, each with the number of times it occurs (at least one).</summary>
    internal static double? Interpolate(IReadOnlyList<KeyValuePair<double, long>> sorted, double percentile) {
        long total = 0;
        foreach (var entry in sorted) total = checked(total + entry.Value);
        if (total == 0) return null;
        var rank = (total - 1) * percentile / 100;
        var lowerRank = (long)Math.Floor(rank);
        var fraction = rank - lowerRank;
        double lower = 0, upper = 0; long seen = 0; var found = false;
        for (var index = 0; index < sorted.Count; index++) {
            seen += sorted[index].Value;
            if (!found && seen > lowerRank) {
                lower = sorted[index].Key; found = true;
                // The next rank is in this entry too, or it is the next entry's value.
                upper = seen > lowerRank + 1 || index + 1 == sorted.Count ? lower : sorted[index + 1].Key;
                break;
            }
        }
        return fraction == 0 ? lower : lower + (upper - lower) * fraction;
    }

    /// <summary>Interpolates over unsorted values, each occurring once.</summary>
    internal static double? Interpolate(List<double> values, double percentile) {
        if (values.Count == 0) return null;
        values.Sort();
        var entries = new List<KeyValuePair<double, long>>(values.Count);
        foreach (var value in values) entries.Add(new KeyValuePair<double, long>(value, 1));
        return Interpolate(entries, percentile);
    }
}
