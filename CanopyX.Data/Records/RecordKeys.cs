using System;
using System.Globalization;

namespace CanopyX.Data;

/// <summary>Converts a record identity to a typed key for an indexed lookup, accepting only the key's canonical text.</summary>
internal static class RecordKeys {
    /// <summary>Whether a key type can be looked up from its identity text: text, GUIDs and integers up to 64 bits.</summary>
    internal static bool Supported(Type type) {
        var t = ExpressionTools.Underlying(type);
        return t == typeof(string) || t == typeof(Guid) || t == typeof(sbyte) || t == typeof(byte) || t == typeof(short) || t == typeof(ushort) ||
            t == typeof(int) || t == typeof(uint) || t == typeof(long) || t == typeof(ulong);
    }

    /// <summary>
    /// The typed key whose invariant text (<see cref="CanopyDataValues.FormatId"/>) is exactly the identity, or null. Text that
    /// another spelling would also parse to (<c>007</c>, <c>+7</c>, an upper-case or braced GUID) is not an identity, so one
    /// record has one identity and an identity never reaches the store as anything but a typed parameter.
    /// </summary>
    internal static object? Parse(string id, Type type) {
        var t = ExpressionTools.Underlying(type);
        // Some stores refuse a NUL character in a text parameter; no stored key holds one, so it finds nothing without a query.
        if (t == typeof(string)) return id.IndexOf('\0') >= 0 ? null : id;
        if (t == typeof(Guid)) return Guid.TryParseExact(id, "D", out var guid) && guid.ToString("D") == id ? guid : (object?)null;
        // Identity text keeps all 64 bits, independently of the numeric-cell range used for display values.
        if (t == typeof(ulong)) return id.Length <= 20 && ulong.TryParse(id, NumberStyles.None, CultureInfo.InvariantCulture, out var unsigned) &&
            unsigned.ToString(CultureInfo.InvariantCulture) == id ? unsigned : (object?)null;
        if (id.Length > 20 || !long.TryParse(id, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number)) return null;
        if (number.ToString(CultureInfo.InvariantCulture) != id) return null;
        if (t == typeof(long)) return number;
        var (minimum, maximum) = ValueShapes.Range(t);
        if (number < minimum || number > maximum) return null;
        return Convert.ChangeType(number, t, CultureInfo.InvariantCulture);
    }

    /// <summary>The identity text of a stored key, or null for a missing or empty key.</summary>
    internal static string? Format(object? key) {
        if (key == null || key is string text && text.Length == 0) return null;
        return CanopyDataValues.FormatId(key);
    }
}
