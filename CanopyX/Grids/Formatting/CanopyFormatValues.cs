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
    private static readonly Regex NumberShape = new Regex(@"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex IsoDate = new Regex(@"^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?$", RegexOptions.CultureInvariant);
    private static readonly Regex SharedSyntax = new Regex(@"\(\?(?![:=!]|<[=!]|<[A-Za-z])", RegexOptions.CultureInvariant);
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
                return Convert.ToDouble(raw, CultureInfo.InvariantCulture);
            case CanopyFormatValueType.Date:
                if (raw is DateTime date) return Milliseconds(date);
                if (raw is DateTimeOffset offset) return Milliseconds(offset.UtcDateTime);
                // ISO dates and times; without a zone they are UTC, as the browser part reads them.
                if (raw is string iso) return IsoDate.IsMatch(iso.Trim()) && DateTimeOffset.TryParse(iso.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? Milliseconds(parsed.UtcDateTime) : null;
                return raw is bool ? null : Convert.ToDouble(raw, CultureInfo.InvariantCulture);
            case CanopyFormatValueType.Boolean:
                if (raw is bool boolean) return boolean;
                if (raw is string word) {
                    var value = word.Trim().ToLowerInvariant();
                    return value == "true" || value == "yes" || value == "on" || value == "1" ? true : value == "false" || value == "no" || value == "off" || value == "0" ? false : null;
                }
                return raw is DateTime ? null : Convert.ToDouble(raw, CultureInfo.InvariantCulture) != 0;
            case CanopyFormatValueType.Text:
                return raw is bool truth ? (truth ? "true" : "false") : raw is DateTime moment ? moment.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture) :
                    raw is double real ? real.ToString("R", CultureInfo.InvariantCulture) : raw as string ?? Convert.ToString(raw, CultureInfo.InvariantCulture);
            default:
                return raw;
        }
    }

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
        if (predicate.Culture != null) return text.ToLower(Culture(predicate.Culture));
        var folded = new StringBuilder(text.Length);
        foreach (var unit in text) folded.Append(CanopySearchFolding.Fold(unit));
        return folded.ToString();
    }

    /// <summary>Orders two read values: text by the culture or by code unit, numbers and booleans by value; mixed types compare equal and never match equality.</summary>
    internal static int Compare(object? a, object? b, CanopyFormatPredicate predicate) {
        if (a is string left && b is string right) return predicate.Culture == null ? Math.Sign(string.CompareOrdinal(left, right)) :
            Math.Sign(Culture(predicate.Culture).CompareInfo.Compare(left, right, predicate.CaseSensitive ? CompareOptions.None : CompareOptions.IgnoreCase));
        if (a is double x && b is double y) return x.CompareTo(y);
        if (a is bool p && b is bool q) return p.CompareTo(q);
        return 0;
    }

    internal static bool Same(object? a, object? b, CanopyFormatPredicate predicate) => a != null && b != null && a.GetType() == b.GetType() && Compare(a, b, predicate) == 0;

    internal static Regex Pattern(CanopyFormatOperator op, string source, bool caseSensitive) {
        if (source.Length > 256) throw new InvalidOperationException("Patterns have at most 256 characters.");
        var wildcard = op == CanopyFormatOperator.Like || op == CanopyFormatOperator.NotLike;
        if (!wildcard && SharedSyntax.IsMatch(source)) throw new InvalidOperationException("Pattern '" + source + "' uses a construct outside the syntax ECMAScript and .NET share.");
        var expression = wildcard ? "^" + Regex.Escape(source).Replace(@"\*", @"[\s\S]*").Replace(@"\?", @"[\s\S]") + "$" : source;
        try {
            return new Regex(expression, RegexOptions.CultureInvariant | (caseSensitive ? RegexOptions.None : RegexOptions.IgnoreCase), TimeSpan.FromMilliseconds(100));
        } catch (ArgumentException) {
            throw new InvalidOperationException("Invalid pattern '" + source + "'.");
        }
    }
}
