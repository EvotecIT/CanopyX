using System;
using System.Globalization;
using System.Numerics;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable display format for raw grid numbers: fraction digits and literal text around the digits.</summary>
/// <remarks>
/// The browser formats digits and group separators in the reader's language; the static renderer uses the invariant culture.
/// Formats change display text only. Search, sort, filters, aggregate calculations and raw exports keep raw values.
/// The binary64 value read from the protocol is rounded once, halfway away from zero, as JavaScript's fixed-point formatting does.
/// </remarks>
public sealed class CanopyGridNumberFormat {
    /// <summary>Creates a number format.</summary>
    /// <param name="minimumFractionDigits">Fraction digits always shown, from 0 to 10. A minimum above 3 requires an explicit maximum.</param>
    /// <param name="maximumFractionDigits">Fraction digits shown at most, from the minimum to 10. Values are rounded half away from zero.</param>
    /// <param name="prefix">Optional literal text before the digits and after any minus sign, such as a currency symbol. At most 16 code units.</param>
    /// <param name="suffix">Optional literal text after the digits, such as <c>%</c> or <c> ms</c>. At most 16 code units.</param>
    /// <exception cref="ArgumentOutOfRangeException">The fraction digits are outside 0 to 10 or the minimum exceeds the maximum.</exception>
    /// <exception cref="ArgumentException">An affix is empty or longer than 16 code units.</exception>
    public CanopyGridNumberFormat(int minimumFractionDigits = 0, int maximumFractionDigits = 3, string? prefix = null, string? suffix = null) {
        if (minimumFractionDigits < 0 || minimumFractionDigits > 10) throw new ArgumentOutOfRangeException(nameof(minimumFractionDigits));
        if (maximumFractionDigits < minimumFractionDigits || maximumFractionDigits > 10) throw new ArgumentOutOfRangeException(nameof(maximumFractionDigits));
        RequireAffix(prefix, nameof(prefix)); RequireAffix(suffix, nameof(suffix));
        MinimumFractionDigits = minimumFractionDigits; MaximumFractionDigits = maximumFractionDigits; Prefix = prefix; Suffix = suffix;
    }

    /// <summary>Creates a format with exactly <paramref name="fractionDigits"/> fraction digits.</summary>
    /// <param name="fractionDigits">Fraction digits, from 0 to 10.</param>
    /// <param name="prefix">Optional literal text before the digits.</param>
    /// <param name="suffix">Optional literal text after the digits.</param>
    /// <returns>The immutable format.</returns>
    public static CanopyGridNumberFormat Fixed(int fractionDigits, string? prefix = null, string? suffix = null) =>
        new CanopyGridNumberFormat(fractionDigits, fractionDigits, prefix, suffix);

    /// <summary>Gets the fraction digits always shown.</summary>
    public int MinimumFractionDigits { get; }
    /// <summary>Gets the fraction digits shown at most.</summary>
    public int MaximumFractionDigits { get; }
    /// <summary>Gets the literal text before the digits, or null.</summary>
    public string? Prefix { get; }
    /// <summary>Gets the literal text after the digits, or null.</summary>
    public string? Suffix { get; }

    /// <summary>Formats a value with invariant digits, as the script-free renderer shows it.</summary>
    /// <param name="value">A finite value.</param>
    /// <returns>The display text; a value that rounds to zero carries no minus sign.</returns>
    public string Format(double value) => Format(value, CultureInfo.InvariantCulture);

    internal string Format(double value, CultureInfo culture) {
        if (double.IsNaN(value) || double.IsInfinity(value)) return string.Empty;
        var rounded = CanopyNumericValues.RoundFractionMagnitude(value, MaximumFractionDigits);
        var whole = BigInteger.DivRem(rounded, BigInteger.Pow(10, MaximumFractionDigits), out var fraction);
        var decimals = MaximumFractionDigits == 0 ? string.Empty : fraction.ToString(CultureInfo.InvariantCulture).PadLeft(MaximumFractionDigits, '0');
        while (decimals.Length > MinimumFractionDigits && decimals[decimals.Length - 1] == '0') decimals = decimals.Substring(0, decimals.Length - 1);
        return (value < 0 && !rounded.IsZero ? culture.NumberFormat.NegativeSign : string.Empty) + Prefix + whole.ToString("N0", culture) +
            (decimals.Length > 0 ? culture.NumberFormat.NumberDecimalSeparator + decimals : string.Empty) + Suffix;
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("minimumFractionDigits", MinimumFractionDigits).Property("maximumFractionDigits", MaximumFractionDigits)
            .OptionalProperty("prefix", Prefix).OptionalProperty("suffix", Suffix).EndObject();
    }

    private static void RequireAffix(string? value, string name) {
        if (value != null && (value.Length == 0 || value.Length > 16)) throw new ArgumentException("Number format affixes need 1 to 16 code units.", name);
    }
}
