using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization;

namespace CanopyX.Data;

/// <summary>Converts store values to the raw value shapes of the protocol, for providers and cell formatters.</summary>
/// <remarks>
/// Normalized values are <see cref="string"/>, <see cref="bool"/>, <see cref="long"/>, <see cref="double"/>,
/// <see cref="decimal"/>, UTC <see cref="DateTime"/> or null. Enumerations become their names, characters and GUIDs
/// become text, <see cref="DateTimeOffset"/> and date-only values become UTC instants, and unspecified
/// <see cref="DateTime"/> values are treated as UTC. Non-finite floating-point values are missing values.
/// </remarks>
public static class CanopyDataValues {
    /// <summary>Normalizes a store value.</summary>
    /// <param name="value">The value, possibly null or <see cref="DBNull"/>.</param>
    /// <returns>The normalized raw value.</returns>
    /// <exception cref="ArgumentException">The value has a type without a protocol shape.</exception>
    public static object? Normalize(object? value) {
        switch (value) {
            case null: return null;
            case DBNull _: return null;
            case string text: return text;
            case bool flag: return flag;
            case char unit: return unit.ToString();
            case Enum member: return EnumText(member);
            case sbyte n: return (long)n;
            case byte n: return (long)n;
            case short n: return (long)n;
            case ushort n: return (long)n;
            case int n: return (long)n;
            case uint n: return (long)n;
            case long n: return n;
            case ulong n: return n <= long.MaxValue ? (object)(long)n : (double)n;
            case float n: return float.IsNaN(n) || float.IsInfinity(n) ? null : (object)(double)n;
            case double n: return double.IsNaN(n) || double.IsInfinity(n) ? null : (object)n;
            case decimal n: return n;
            case DateTime date: return date.Kind == DateTimeKind.Local ? date.ToUniversalTime() : DateTime.SpecifyKind(date, DateTimeKind.Utc);
            case DateTimeOffset instant: return instant.UtcDateTime;
            case Guid id: return id.ToString("D");
        }
#if NET6_0_OR_GREATER
        if (value is DateOnly day) return day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
#endif
        throw new ArgumentException("Values of type " + value.GetType().Name + " have no CanopyX raw value shape.", nameof(value));
    }

    /// <summary>Gets the raw text of an enumeration member: its <see cref="EnumMemberAttribute"/> value when it declares one,
    /// otherwise its name; a combination of flags joins its flags' texts. Filtering, searching, sorting, value lists and exports
    /// all read this text. Filters match defined members only, so undefined values and flag combinations are never matched by value.</summary>
    /// <param name="value">The member.</param>
    /// <returns>The text.</returns>
    public static string EnumText(Enum value) {
        if (value == null) throw new ArgumentNullException(nameof(value));
        var names = EnumNames.GetOrAdd(value.GetType(), type => {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static)) {
                var member = field.GetCustomAttribute<EnumMemberAttribute>();
                if (member?.Value != null && member.Value.Length > 0) map[field.Name] = member.Value;
            }
            return map;
        });
        var name = value.ToString();
        if (names.TryGetValue(name, out var text)) return text;
        // A combination of flags reads each flag by its own text.
        if (name.IndexOf(", ", StringComparison.Ordinal) >= 0 && value.GetType().IsDefined(typeof(FlagsAttribute), false))
            return string.Join(", ", name.Split(new[] { ", " }, StringSplitOptions.None).Select(part => names.TryGetValue(part, out var flag) ? flag : part));
        return name;
    }

    private static readonly ConcurrentDictionary<Type, Dictionary<string, string>> EnumNames = new ConcurrentDictionary<Type, Dictionary<string, string>>();

    /// <summary>Creates a cell holding a normalized store value, or null for a missing value.</summary>
    /// <param name="value">The store value.</param>
    /// <returns>The cell, or null.</returns>
    public static CanopyCell? ToCell(object? value) {
        switch (Normalize(value)) {
            case null: return null;
            case string text: return new CanopyCell(text);
            case bool flag: return new CanopyCell(flag);
            case long n: return new CanopyCell(n);
            case double n: return new CanopyCell(n);
            case decimal n: return new CanopyCell(n);
            case DateTime date: return new CanopyCell(date);
            default: return null;
        }
    }

    /// <summary>Formats a record key as a stable row identity: text as is, numbers and dates in invariant form.</summary>
    /// <param name="key">The key value.</param>
    /// <returns>The identity text.</returns>
    /// <exception cref="InvalidOperationException">The key is null or empty.</exception>
    public static string FormatId(object? key) {
        var text = Normalize(key) switch {
            null => null,
            string value => value,
            DateTime date => FormatDate(date),
            double number => FormatNumber(number),
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            var other => other.ToString()
        };
        if (string.IsNullOrEmpty(text)) throw new InvalidOperationException("A record key must not be null or empty.");
        return text!;
    }

    /// <summary>Formats a raw value as the text quick search and text matching read: JavaScript number text and ISO dates.</summary>
    /// <param name="value">The store value.</param>
    /// <returns>The text, or null for a missing value.</returns>
    public static string? ToSearchText(object? value) => Normalize(value) switch {
        null => null,
        string text => text,
        bool flag => flag ? "true" : "false",
        DateTime date => FormatDate(date),
        long n => n.ToString(CultureInfo.InvariantCulture),
        decimal n => FormatNumber((double)n),
        double n => FormatNumber(n),
        var other => other.ToString()
    };

    /// <summary>Formats a UTC instant as ISO 8601 with milliseconds only when they are not zero, as the protocol writer does.</summary>
    /// <param name="date">The instant.</param>
    /// <returns>The ISO text.</returns>
    public static string FormatDate(DateTime date) {
        date = (DateTime)Normalize(date)!;
        return date.ToString(date.Millisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    /// <summary>Formats a number the way JavaScript's <c>String(number)</c> does for finite values.</summary>
    /// <param name="number">The number.</param>
    /// <returns>The text.</returns>
    public static string FormatNumber(double number) {
        if (number == 0) return "0";
        if (Math.Abs(number) < 1e21 && Math.Abs(number) >= 1e-6) {
            var fixedText = number.ToString("R", CultureInfo.InvariantCulture);
            if (fixedText.IndexOf('E') < 0) return fixedText;
            return decimal.Parse(fixedText, NumberStyles.Float, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        var text = number.ToString("R", CultureInfo.InvariantCulture);
        var e = text.IndexOf('E');
        if (e < 0) return text;
        var exponent = int.Parse(text.Substring(e + 1), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        return text.Substring(0, e) + "e" + (exponent < 0 ? "-" : "+") + Math.Abs(exponent).ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Truncates an instant to whole milliseconds, the precision of date comparisons.</summary>
    internal static DateTime TruncateToMilliseconds(DateTime date) => new DateTime(date.Ticks - date.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc);

    /// <summary>Converts a normalized numeric value to binary64 for comparison.</summary>
    internal static double ToDouble(object value) => value switch {
        long n => n,
        decimal n => (double)n,
        double n => n,
        _ => Convert.ToDouble(value, CultureInfo.InvariantCulture)
    };
}
