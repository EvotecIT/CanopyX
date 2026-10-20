using System;
using System.Globalization;

namespace CanopyX;

/// <summary>
/// Row identities written from numeric keys, and the identity order every grid uses as its last sort key: identities order
/// by UTF-16 code unit, except canonical integers (<c>0</c>, <c>42</c>: no sign, no leading zero), which order as numbers and
/// before every other identity. A dataset keyed by numbers therefore keeps its natural order (2 before 10) without padding.
/// </summary>
/// <remarks>
/// The browser runtime, <see cref="CanopyGridRowData"/> and the CanopyX.Data in-memory provider share this order. A host that
/// pages a grid from its own store orders by its key column instead; a numeric key column already sorts as numbers (a negative key, which
/// identity order treats as text after every non-negative integer, is the exception).
/// </remarks>
public static class CanopyRowIdentity {
    /// <summary>Writes a numeric key as a row identity: invariant digits, with a minus sign for negative keys.</summary>
    /// <param name="key">The key.</param>
    /// <returns>The identity, such as <c>42</c>.</returns>
    public static string Format(long key) => key.ToString(CultureInfo.InvariantCulture);

    /// <summary>Gets whether an identity is a canonical integer: digits only, without a sign or a leading zero.</summary>
    /// <param name="id">The identity.</param>
    /// <returns>True for identities such as <c>0</c> and <c>42</c>; false for <c>042</c>, <c>-1</c> and <c>r1</c>.</returns>
    public static bool IsInteger(string? id) {
        if (string.IsNullOrEmpty(id) || id!.Length > 1 && id[0] == '0') return false;
        foreach (var character in id) if (character < '0' || character > '9') return false;
        return true;
    }

    /// <summary>Compares two identities in identity order.</summary>
    /// <param name="left">The first identity.</param>
    /// <param name="right">The second identity.</param>
    /// <returns>A negative number when <paramref name="left"/> comes first, zero when they are equal, positive otherwise.</returns>
    public static int Compare(string? left, string? right) {
        if (string.Equals(left, right, StringComparison.Ordinal)) return 0;
        if (left == null) return -1;
        if (right == null) return 1;
        bool a = IsInteger(left), b = IsInteger(right);
        if (a != b) return a ? -1 : 1;
        if (a && left.Length != right.Length) return left.Length < right.Length ? -1 : 1;
        return string.CompareOrdinal(left, right) < 0 ? -1 : 1;
    }
}
