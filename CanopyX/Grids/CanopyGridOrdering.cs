using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Text;
using CanopyX.Bundles;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable text comparer for complete-query ordering in a grid or host.</summary>
/// <remarks>
/// Declared categories precede other values. Remaining values use the chosen text order. Null is last;
/// callers keep missing values last before applying descending direction and use stable row identities for ties.
/// Natural digit runs are compared without converting them to floating-point numbers; leading zeroes tie.
/// </remarks>
public sealed class CanopyGridOrdering : IComparer<string> {
    private readonly bool _fold;
    private readonly bool _natural;
    private readonly Dictionary<string, int> _categories = new Dictionary<string, int>(StringComparer.Ordinal);

    /// <summary>Creates a text policy with at most 512 distinct category values.</summary>
    /// <param name="order">The deterministic text comparison.</param>
    /// <param name="categories">Optional ordered values, unique after the selected case folding.</param>
    /// <exception cref="ArgumentException">A category is null, longer than 4,096 code units, or duplicates another category.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The order is unknown or there are more than 512 categories.</exception>
    public CanopyGridOrdering(CanopyGridTextOrder order = CanopyGridTextOrder.Ordinal, IEnumerable<string>? categories = null) {
        if (!Enum.IsDefined(typeof(CanopyGridTextOrder), order))
            throw new ArgumentOutOfRangeException(nameof(order));
        Order = order;
        _fold = order == CanopyGridTextOrder.FoldedOrdinal || order == CanopyGridTextOrder.FoldedNatural;
        _natural = order == CanopyGridTextOrder.Natural || order == CanopyGridTextOrder.FoldedNatural;
        var values = new List<string>();
        if (categories != null) foreach (var value in categories) {
            if (values.Count == 512) throw new ArgumentOutOfRangeException(nameof(categories), "At most 512 categories are supported.");
            if (value == null || value.Length > 4096) throw new ArgumentException("Category text is required and bounded to 4096 code units.", nameof(categories));
            var key = Key(value);
            if (_categories.ContainsKey(key)) throw new ArgumentException("Category values must be distinct after case folding.", nameof(categories));
            _categories.Add(key, values.Count); values.Add(value);
        }
        Categories = new ReadOnlyCollection<string>(values);
    }

    /// <summary>Gets the text comparison.</summary>
    public CanopyGridTextOrder Order { get; }

    /// <summary>Gets the immutable category order. Values outside this list follow declared values.</summary>
    public IReadOnlyList<string> Categories { get; }

    /// <summary>Compares text using the same code-unit and digit rules as the reporting runtime.</summary>
    /// <param name="left">The first text value.</param>
    /// <param name="right">The second text value.</param>
    /// <returns>A negative, zero, or positive value; null values follow text values.</returns>
    public int Compare(string? left, string? right) {
        if (left == null || right == null) return left == right ? 0 : left == null ? 1 : -1;
        if (_categories.Count != 0) {
            var a = _categories.TryGetValue(Key(left), out var ai) ? ai : Categories.Count;
            var b = _categories.TryGetValue(Key(right), out var bi) ? bi : Categories.Count;
            if (a != b) return a.CompareTo(b);
        }
        var i = 0; var j = 0;
        while (i < left.Length && j < right.Length) {
            if (_natural && Digit(left[i]) && Digit(right[j])) {
                var endA = i; var endB = j;
                while (endA < left.Length && Digit(left[endA])) endA++;
                while (endB < right.Length && Digit(right[endB])) endB++;
                while (i + 1 < endA && left[i] == '0') i++;
                while (j + 1 < endB && right[j] == '0') j++;
                var length = (endA - i).CompareTo(endB - j);
                if (length != 0) return length;
                while (i < endA) {
                    var digits = left[i++].CompareTo(right[j++]);
                    if (digits != 0) return digits;
                }
                i = endA; j = endB;
            } else {
                var a = _fold ? CanopySearchFolding.Fold(left[i]) : left[i];
                var b = _fold ? CanopySearchFolding.Fold(right[j]) : right[j];
                var compared = a.CompareTo(b);
                if (compared != 0) return compared;
                i++; j++;
            }
        }
        return (left.Length - i).CompareTo(right.Length - j);
    }

    private static bool Digit(char value) => value >= '0' && value <= '9';

    private string Key(string text) {
        if (!_fold) return text;
        var key = new StringBuilder(text.Length);
        foreach (var unit in text) key.Append(CanopySearchFolding.Fold(unit));
        return key.ToString();
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        var name = Order == CanopyGridTextOrder.Ordinal ? "ordinal" : Order == CanopyGridTextOrder.FoldedOrdinal ? "foldedOrdinal" :
            Order == CanopyGridTextOrder.Natural ? "natural" : "foldedNatural";
        writer.BeginObject().Property("text", name);
        if (Categories.Count != 0) {
            writer.Name("categories").BeginArray();
            foreach (var category in Categories) writer.String(category);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
