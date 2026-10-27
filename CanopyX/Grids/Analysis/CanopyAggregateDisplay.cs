using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX;

/// <summary>Pure aggregate display mathematics shared by summaries, pivots and host exports.</summary>
/// <remarks>Percent values are fractions, paired with an Excel-style percent number format. Raw aggregates are never changed.</remarks>
public static partial class CanopyAggregateDisplay {
    /// <summary>Transforms at most 10,000 sibling values in their accepted order.</summary>
    /// <param name="values">Raw aggregates; missing values stay missing in every mode.</param>
    /// <param name="mode">The transformation.</param>
    /// <param name="grandTotal">The complete-query denominator for percent of grand total.</param>
    /// <param name="parentTotal">The shared parent denominator for percent of parent.</param>
    /// <param name="rowTotals">One denominator per value for percent of pivot row.</param>
    /// <param name="columnTotals">One denominator per value for percent of pivot column.</param>
    /// <returns>Transformed values in the same order; an undefined or non-finite result is null.</returns>
    public static IReadOnlyList<double?> Evaluate(IReadOnlyList<double?> values, CanopyShowAs mode, double? grandTotal = null, double? parentTotal = null,
        IReadOnlyList<double?>? rowTotals = null, IReadOnlyList<double?>? columnTotals = null) {
        if (values == null) throw new ArgumentNullException(nameof(values));
        if (values.Count > 10000) throw new ArgumentOutOfRangeException(nameof(values), "At most 10,000 sibling aggregates are supported.");
        if (!Enum.IsDefined(typeof(CanopyShowAs), mode)) throw new ArgumentOutOfRangeException(nameof(mode));
        if (rowTotals != null && rowTotals.Count != values.Count || columnTotals != null && columnTotals.Count != values.Count)
            throw new ArgumentException("Pivot denominators must have one entry per value.");
        if (values.Any(value => value.HasValue && !CanopyBucket.Finite(value.Value))) throw new ArgumentException("Aggregate inputs must be finite or missing.", nameof(values));
        var result = new double?[values.Count];
        var ranks = new Dictionary<double, int>();
        if (mode == CanopyShowAs.Rank) {
            var ordered = values.Where(value => value.HasValue).Select(value => value!.Value).OrderByDescending(value => value).ToArray();
            for (var i = 0; i < ordered.Length; i++) if (!ranks.ContainsKey(ordered[i])) ranks.Add(ordered[i], i + 1);
        }
        var running = 0d;
        for (var i = 0; i < values.Count; i++) {
            var raw = values[i];
            if (!raw.HasValue) continue;
            var value = raw.Value;
            double? Divide(double? denominator) => denominator.HasValue && denominator != 0 ? value / denominator : null;
            double? transformed;
            switch (mode) {
                case CanopyShowAs.PercentGrandTotal: transformed = Divide(grandTotal); break;
                case CanopyShowAs.PercentParent: transformed = Divide(parentTotal); break;
                case CanopyShowAs.PercentRow: transformed = Divide(rowTotals?[i]); break;
                case CanopyShowAs.PercentColumn: transformed = Divide(columnTotals?[i]); break;
                case CanopyShowAs.RunningTotal: running += value; transformed = running; break;
                case CanopyShowAs.Rank: transformed = ranks[value]; break;
                case CanopyShowAs.Difference: transformed = i == 0 || !values[i - 1].HasValue ? null : value - values[i - 1]!.Value; break;
                case CanopyShowAs.PercentChange: transformed = i == 0 || !values[i - 1].HasValue || values[i - 1] == 0 ? null : (value - values[i - 1]!.Value) / values[i - 1]!.Value; break;
                default: transformed = value; break;
            }
            result[i] = transformed.HasValue && CanopyBucket.Finite(transformed.Value) ? transformed : null;
        }
        return Array.AsReadOnly(result);
    }

    /// <summary>Gets whether a transformation returns fractional percent values.</summary>
    /// <param name="mode">The transformation.</param>
    /// <returns>True for percent/share/change modes.</returns>
    public static bool IsPercentage(CanopyShowAs mode) => mode == CanopyShowAs.PercentGrandTotal || mode == CanopyShowAs.PercentParent ||
        mode == CanopyShowAs.PercentRow || mode == CanopyShowAs.PercentColumn || mode == CanopyShowAs.PercentChange;

    /// <summary>Gets the spreadsheet number format paired with a transformed numeric value.</summary>
    /// <param name="mode">The transformation.</param>
    /// <returns>Percent, integer rank, or ordinary numeric format; numeric values remain numeric on export.</returns>
    public static string NumberFormat(CanopyShowAs mode) => IsPercentage(mode) ? "0.00%" : mode == CanopyShowAs.Rank ? "0" : "0.00";

    internal static string Name(CanopyShowAs mode) => mode == CanopyShowAs.Value ? "value" : char.ToLowerInvariant(mode.ToString()[0]) + mode.ToString().Substring(1);
}
