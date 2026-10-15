using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>Value-list order: booleans first, then text by folded and then raw ordinal text, numbers and dates ascending, missing values last.</summary>
internal sealed class FacetOrder : IComparer<object?> {
    internal static readonly FacetOrder Instance = new FacetOrder();

    public int Compare(object? left, object? right) {
        if (left == null || right == null) return left == right ? 0 : left == null ? 1 : -1;
        var rank = Rank(left).CompareTo(Rank(right));
        if (rank != 0) return rank;
        switch (left) {
            case bool flag: return flag.CompareTo((bool)right);
            case string text:
                var folded = string.CompareOrdinal(CanopyTextFolding.Fold(text), CanopyTextFolding.Fold((string)right));
                return folded != 0 ? folded : string.CompareOrdinal(text, (string)right);
            case DateTime date: return date.CompareTo((DateTime)right);
            default: return CanopyDataValues.ToDouble(left).CompareTo(CanopyDataValues.ToDouble(right));
        }
    }

    private static int Rank(object value) => value is bool ? 0 : value is string ? 1 : value is DateTime ? 3 : 2;
}
