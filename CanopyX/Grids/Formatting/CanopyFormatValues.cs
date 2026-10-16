using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Bundles;

namespace CanopyX;

/// <summary>
/// The value semantics of formatting conditions, matching the browser part: typed reading with an optional culture, text
/// folding, ordering, and patterns. Dates are epoch milliseconds, numbers doubles.
/// </summary>
internal static class CanopyFormatValues {
    private static readonly ConcurrentDictionary<string, CultureInfo> Cultures = new ConcurrentDictionary<string, CultureInfo>(StringComparer.Ordinal);
    private static readonly Regex NumberShape = new Regex(@"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex IsoDate = new Regex(@"^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?$", RegexOptions.CultureInvariant);
    private static readonly DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    internal static CultureInfo Culture(string name) {
        if (Cultures.TryGetValue(name, out var culture)) return culture;
        try { culture = CultureInfo.GetCultureInfo(name); }
        catch (CultureNotFoundException) { throw new InvalidOperationException("Unknown culture '" + name + "'."); }
        if (Cultures.Count < 64) Cultures[name] = culture;
        return culture;
    }

    internal static CanopyFormatValueType TypeOf(CanopyFormatPredicate predicate, CanopyColumn column) =>
        predicate.Operator == CanopyFormatOperator.OlderThanDays || predicate.Operator == CanopyFormatOperator.WithinLastDays ? CanopyFormatValueType.Date :
        predicate.ValueType != CanopyFormatValueType.Auto ? predicate.ValueType :
        column.Kind == CanopyColumnKind.Number ? CanopyFormatValueType.Number : column.Kind == CanopyColumnKind.DateTime ? CanopyFormatValueType.Date : CanopyFormatValueType.Auto;

    /// <summary>A raw value read as a type: a double, epoch milliseconds, a bool, text, or the raw text or bool; null when it does not convert.</summary>
    internal static object? Coerce(object? raw, CanopyFormatValueType type, string? culture) {
        raw = CanopyGridValues.Normalize(raw);
        if (raw == null) return null;
        switch (type) {
            case CanopyFormatValueType.Number:
                if (raw is bool flag) return flag ? 1d : 0d;
                if (raw is string text) return Number(text, culture);
                if (raw is DateTime) return null;
                return CanopyNumericValues.ToDouble(raw);
            case CanopyFormatValueType.Date:
                if (raw is DateTime date) return Milliseconds(date);
                if (raw is DateTimeOffset offset) return Milliseconds(offset.UtcDateTime);
                // ISO dates and times; without a zone they are UTC, as the browser part reads them.
                if (raw is string iso) return IsoDate.IsMatch(iso.Trim()) && DateTimeOffset.TryParse(iso.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? Milliseconds(parsed.UtcDateTime) : null;
                return raw is bool ? null : CanopyNumericValues.ToDouble(raw);
            case CanopyFormatValueType.Boolean:
                if (raw is bool boolean) return boolean;
                if (raw is string word) {
                    var value = word.Trim().ToLowerInvariant();
                    return value == "true" || value == "yes" || value == "on" || value == "1" ? true : value == "false" || value == "no" || value == "off" || value == "0" ? false : null;
                }
                return raw is DateTime ? null : CanopyNumericValues.ToDouble(raw) != 0;
            case CanopyFormatValueType.Text:
                return Text(raw);
            default:
                return raw is DateTime moment ? CanopyCell.FormatIso(moment) :
                    raw is decimal || raw is long ? CanopyNumericValues.ToDouble(raw) : raw;
        }
    }

    /// <summary>The scalar spelling seen by JavaScript after the canonical cell writer emits the value.</summary>
    internal static string Text(object raw) => raw is bool flag ? (flag ? "true" : "false") :
        raw is DateTime date ? CanopyCell.FormatIso(date) : raw is decimal || raw is double || raw is long
            ? CanopyNumericValues.FormatNumber(CanopyNumericValues.ToDouble(raw)) :
            raw as string ?? Convert.ToString(raw, CultureInfo.InvariantCulture)!;

    internal static double? Number(string text, string? culture) {
        var builder = new StringBuilder(text.Length);
        foreach (var unit in text.Trim()) if (!char.IsWhiteSpace(unit) && unit != ' ' && unit != ' ' && unit != '\'') builder.Append(unit);
        var value = builder.ToString();
        if (culture != null) {
            var format = Culture(culture).NumberFormat;
            value = value.Replace(format.NumberGroupSeparator, string.Empty).Replace(format.NumberDecimalSeparator, ".");
        }
        return NumberShape.IsMatch(value) && double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && !double.IsInfinity(number) ? number : null;
    }

    private static double Milliseconds(DateTime date) =>
        Math.Floor(((date.Kind == DateTimeKind.Local ? date.ToUniversalTime() : DateTime.SpecifyKind(date, DateTimeKind.Utc)) - Epoch).TotalMilliseconds);

    /// <summary>A value read for comparison: typed, then text folded unless the predicate is case-sensitive.</summary>
    internal static object? Read(object? raw, CanopyFormatPredicate predicate, CanopyColumn column) {
        var value = Coerce(raw, TypeOf(predicate, column), predicate.Culture);
        if (!(value is string text) || predicate.CaseSensitive) return value;
        if (predicate.Culture != null) return CanopyPattern.LowerNativeInput(text, Culture(predicate.Culture).Name);
        var folded = new StringBuilder(text.Length);
        foreach (var unit in text) folded.Append(CanopySearchFolding.Fold(unit));
        return folded.ToString();
    }

    /// <summary>Orders read values as the browser's relational comparisons do. Mixed scalar types use numeric
    /// conversion; unordered NaN comparisons return zero, while equality still checks the original types.</summary>
    internal static int Compare(object? a, object? b, CanopyFormatPredicate predicate) {
        if (a is string left && b is string right) return predicate.Culture == null ? Math.Sign(string.CompareOrdinal(left, right)) :
            Math.Sign(Culture(predicate.Culture).CompareInfo.Compare(left, right, predicate.CaseSensitive ? CompareOptions.None : CompareOptions.IgnoreCase));
        var x = RelationalNumber(a); var y = RelationalNumber(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }

    private static double RelationalNumber(object? value) {
        if (value is bool flag) return flag ? 1 : 0;
        if (!(value is string text)) return value is double || value is decimal || value is long ? CanopyNumericValues.ToDouble(value) : double.NaN;
        text = text.Trim(' ', '\t', '\n', '\r', '\v', '\f', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002',
            '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff');
        if (text.Length == 0) return 0;
        if (text == "Infinity" || text == "+Infinity") return double.PositiveInfinity;
        if (text == "-Infinity") return double.NegativeInfinity;
        if (text.Length > 2 && text[0] == '0') {
            var radix = text[1] == 'x' || text[1] == 'X' ? 16 : text[1] == 'b' || text[1] == 'B' ? 2 : text[1] == 'o' || text[1] == 'O' ? 8 : 0;
            if (radix != 0) {
                double number = 0;
                for (var index = 2; index < text.Length; index++) {
                    var unit = text[index];
                    var digit = unit >= '0' && unit <= '9' ? unit - '0' : unit >= 'a' && unit <= 'f' ? unit - 'a' + 10 : unit >= 'A' && unit <= 'F' ? unit - 'A' + 10 : -1;
                    if (digit < 0 || digit >= radix) return double.NaN;
                    number = number * radix + digit;
                }
                return number;
            }
        }
        if (!NumberShape.IsMatch(text)) return double.NaN;
        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)) return parsed;
        // The legacy CLR reports false for overflow, whereas Number(text) returns an infinity (or zero for
        // extreme negative exponents). Infer only those boundaries from already-valid ASCII decimal text.
        var negative = text[0] == '-'; var indexOfExponent = text.IndexOfAny(new[] { 'e', 'E' });
        var coefficientEnd = indexOfExponent < 0 ? text.Length : indexOfExponent;
        var fraction = false; var fractionalDigits = 0; var significantDigits = 0;
        for (var index = text[0] == '-' || text[0] == '+' ? 1 : 0; index < coefficientEnd; index++) {
            var unit = text[index];
            if (unit == '.') { fraction = true; continue; }
            if (unit < '0' || unit > '9') return double.NaN;
            if (fraction) fractionalDigits++;
            if (unit != '0' || significantDigits != 0) significantDigits++;
        }
        if (significantDigits == 0) return 0;
        long exponent = 0;
        if (indexOfExponent >= 0) {
            var index = indexOfExponent + 1; var minus = text[index] == '-';
            if (minus || text[index] == '+') index++;
            var cap = (long)text.Length + 400;
            for (; index < text.Length; index++) exponent = Math.Min(cap, exponent * 10 + text[index] - '0');
            if (minus) exponent = -exponent;
        }
        var magnitude = exponent + significantDigits - fractionalDigits - 1;
        return magnitude >= 308 ? negative ? double.NegativeInfinity : double.PositiveInfinity : magnitude <= -324 ? 0 : double.NaN;
    }

    internal static bool Same(object? a, object? b, CanopyFormatPredicate predicate) => a != null && b != null && a.GetType() == b.GetType() && Compare(a, b, predicate) == 0;

    internal static CanopyNativePattern Pattern(CanopyFormatOperator op, string source, bool caseSensitive) {
        if (source.Length > 256) throw new InvalidOperationException("Patterns have at most 256 characters.");
        var wildcard = op == CanopyFormatOperator.Like || op == CanopyFormatOperator.NotLike;
        try {
            if (!wildcard) return new CanopyNativePattern(CanopyPattern.CompileNative(source, caseSensitive), caseSensitive);
            var expression = @"\A" + Regex.Escape(caseSensitive ? source : CanopyPattern.LowerNativeInput(source)).Replace(@"\*", @"[\s\S]*").Replace(@"\?", @"[\s\S]") + @"\z";
            return new CanopyNativePattern(new Regex(expression, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)), caseSensitive, wildcard: true);
        } catch (ArgumentException) {
            throw new InvalidOperationException("Invalid pattern '" + source + "'.");
        }
    }
}
