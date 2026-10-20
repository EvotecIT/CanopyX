using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The value rules of the flow contract: identifiers, plain texts, scalar option values, ISO 8601 dates and durations, and
/// the canonical form of each field kind's value as the document writes it.
/// </summary>
internal static class CanopyFlowValues {
    internal const int MaxShortText = 200;
    internal const int MaxLongText = 1000;
    internal const int MaxPlaceholder = 256;
    internal const int MaxConditionText = 4096;
    internal const int MaxOptions = 1000;
    internal const int MaxItems = 1000;

    private static readonly Regex Duration = new Regex(@"^P(?:([0-9]{1,9})D)?(?:T(?:([0-9]{1,9})H)?(?:([0-9]{1,9})M)?(?:([0-9]{1,9})S)?)?$", RegexOptions.CultureInvariant);
    private static readonly Regex DateShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", RegexOptions.CultureInvariant);
    private static readonly Regex TimeShape = new Regex(@"^([01][0-9]|2[0-3]):[0-5][0-9]$", RegexOptions.CultureInvariant);
    private static readonly Regex MomentShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,7})?)?(?:Z|[+-][0-9]{2}:[0-9]{2})$", RegexOptions.CultureInvariant);
    private static readonly string[] MomentFormats = {
        "yyyy-MM-dd'T'HH:mmK", "yyyy-MM-dd'T'HH:mm:ssK", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFK"
    };

    /// <summary>Whether a value is a flow identifier: a letter, then up to 63 letters, digits, hyphens and underscores.</summary>
    internal static bool IsIdentifier(string? value) {
        if (value == null || value.Length == 0 || value.Length > 64 || !IsLetter(value[0])) return false;
        foreach (var ch in value) if (!(IsLetter(ch) || ch >= '0' && ch <= '9' || ch == '-' || ch == '_')) return false;
        return true;
    }

    internal static string RequireIdentifier(string? value, string name, string what) =>
        IsIdentifier(value) ? value! : throw new ArgumentException(what + " is a letter, then up to 63 letters, digits, hyphens or underscores.", name);

    private static bool IsLetter(char ch) => ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z';

    /// <summary>Whether a text has something to see, as the browser judges it (U+FEFF counts as white space too).</summary>
    internal static bool HasVisibleText(string value) => value.Trim().Trim('﻿').Trim().Length != 0;

    /// <summary>Checks a short text (a title, label, option label, badge or state name): visible text of at most 200 characters.</summary>
    internal static void CheckShort(string? value, string what, bool required = false) {
        if (value == null) {
            if (required) throw new InvalidOperationException(what + " is required.");
            return;
        }

        if (!HasVisibleText(value) || value.Length > MaxShortText) throw new InvalidOperationException(what + " needs visible text of at most 200 characters.");
    }

    /// <summary>Checks a text with a smaller limit of its own (the browser's layout limits): visible text of at most <paramref name="max"/> characters.</summary>
    internal static void CheckText(string? value, string what, int max) {
        if (value != null && (!HasVisibleText(value) || value.Length > max)) throw new InvalidOperationException(what + " needs visible text of at most " + max.ToString(CultureInfo.InvariantCulture) + " characters.");
    }

    /// <summary>Checks a long text (a description, help line, declaration or disabled reason): visible text of at most 1,000 characters.</summary>
    internal static void CheckLong(string? value, string what) {
        if (value != null && (!HasVisibleText(value) || value.Length > MaxLongText)) throw new InvalidOperationException(what + " needs visible text of at most 1000 characters.");
    }

    /// <summary>Whether a dot path names a setting: names of letters, digits, hyphens and underscores joined by dots, at most 256 characters.</summary>
    internal static bool IsPath(string? value) {
        if (value == null || value.Length == 0 || value.Length > 256) return false;
        var segment = 0;
        foreach (var ch in value) {
            if (ch == '.') {
                if (segment == 0) return false;
                segment = 0;
            } else if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '-' || ch == '_') {
                segment++;
            } else {
                return false;
            }
        }

        return segment > 0;
    }

    /// <summary>
    /// A scalar value of the contract (an option value or a condition value) in its canonical form: a string, a finite
    /// double within the safe integer magnitude, or a boolean; false for anything else.
    /// </summary>
    internal static bool TryScalar(object? value, out object scalar) {
        switch (value) {
            case string text:
                scalar = text;
                return true;
            case bool flag:
                scalar = flag;
                return true;
            case double _:
            case float _:
            case decimal _:
            case long _:
            case int _:
            case short _:
            case byte _:
            case sbyte _:
            case ushort _:
            case uint _:
            case ulong _:
                var number = CanopyNumericValues.ToDouble(value);
                if (double.IsNaN(number) || double.IsInfinity(number) || Math.Abs(number) > 9007199254740991d) break;
                scalar = number;
                return true;
        }

        scalar = string.Empty;
        return false;
    }

    /// <summary>Whether two canonical scalars are the same value: the same type and equal, text compared ordinally.</summary>
    internal static bool SameScalar(object a, object b) => a switch {
        string text => b is string other && string.Equals(text, other, StringComparison.Ordinal),
        double number => b is double other && number == other,
        bool flag => b is bool other && flag == other,
        _ => false
    };

    /// <summary>Writes an ISO 8601 duration in its canonical form: days, then hours, minutes and seconds; zero is <c>PT0S</c>.</summary>
    internal static string FormatDuration(TimeSpan value) {
        if (value < TimeSpan.Zero) throw new InvalidOperationException("A duration cannot be negative.");
        if (value.Ticks % TimeSpan.TicksPerSecond != 0) throw new InvalidOperationException("A duration is a whole number of seconds.");
        if (value == TimeSpan.Zero) return "PT0S";
        var builder = new StringBuilder("P");
        if (value.Days > 0) builder.Append(value.Days.ToString(CultureInfo.InvariantCulture)).Append('D');
        if (value.Hours > 0 || value.Minutes > 0 || value.Seconds > 0) {
            builder.Append('T');
            if (value.Hours > 0) builder.Append(value.Hours.ToString(CultureInfo.InvariantCulture)).Append('H');
            if (value.Minutes > 0) builder.Append(value.Minutes.ToString(CultureInfo.InvariantCulture)).Append('M');
            if (value.Seconds > 0) builder.Append(value.Seconds.ToString(CultureInfo.InvariantCulture)).Append('S');
        }

        return builder.ToString();
    }

    /// <summary>Reads an ISO 8601 duration of days, hours, minutes and whole seconds (<c>PT15M</c>, <c>P1DT2H</c>); no years, months or weeks.</summary>
    internal static bool TryParseDuration(string? text, out TimeSpan value) {
        value = TimeSpan.Zero;
        if (text == null) return false;
        var match = Duration.Match(text);
        if (!match.Success || text == "P" || text.EndsWith("T", StringComparison.Ordinal)) return false;
        try {
            long seconds = 0;
            if (match.Groups[1].Success) seconds = checked(seconds + long.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) * 86400);
            if (match.Groups[2].Success) seconds = checked(seconds + long.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture) * 3600);
            if (match.Groups[3].Success) seconds = checked(seconds + long.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture) * 60);
            if (match.Groups[4].Success) seconds = checked(seconds + long.Parse(match.Groups[4].Value, CultureInfo.InvariantCulture));
            if (seconds > TimeSpan.MaxValue.Ticks / TimeSpan.TicksPerSecond) return false;
            value = TimeSpan.FromTicks(seconds * TimeSpan.TicksPerSecond);
            return true;
        } catch (OverflowException) {
            return false;
        }
    }

    /// <summary>Reads an ISO 8601 moment with <c>Z</c> or an offset, as a date-and-time value writes it.</summary>
    internal static bool TryParseMoment(string? text, out DateTimeOffset value) {
        value = default;
        return text != null && MomentShape.IsMatch(text) &&
            DateTimeOffset.TryParseExact(text, MomentFormats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out value);
    }

    /// <summary>The ISO 8601 UTC text of a moment, at millisecond precision (as the browser keeps it).</summary>
    internal static string FormatMoment(DateTimeOffset value) {
        var utc = value.UtcDateTime;
        return CanopyCell.FormatIso(new DateTime(utc.Ticks - utc.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc));
    }

    /// <summary>
    /// The canonical value of a field as the document writes it (<c>default</c> and <c>initial</c>): null, a string, a double, a
    /// boolean, or a list of them. Throws when the value does not fit the field's kind or options.
    /// </summary>
    internal static object? Canonical(CanopyFlowField field, object? value, string what) {
        if (value == null) return null;
        var canonical = TryCanonical(field, value, out var error);
        if (error != null) throw new InvalidOperationException(what + " of field " + field.Id + " " + error);
        return canonical;
    }

    /// <summary>The canonical value of a field, or null with the reason in <paramref name="error"/>.</summary>
    internal static object? TryCanonical(CanopyFlowField field, object value, out string? error) {
        error = null;
        switch (field.Kind) {
            case CanopyFlowFieldKind.Text:
            case CanopyFlowFieldKind.TextArea:
                if (value is string text) return text;
                error = "must be text.";
                return null;
            case CanopyFlowFieldKind.Number:
                if (!(value is string) && !(value is bool) && TryScalar(value, out var number)) return number;
                error = "must be a finite number within the safe integer magnitude.";
                return null;
            case CanopyFlowFieldKind.Toggle:
                if (value is bool flag) return flag;
                error = "must be true or false.";
                return null;
            case CanopyFlowFieldKind.Date:
                if (value is DateTime date) return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                if (value is string day && DateShape.IsMatch(day) && DateTime.TryParseExact(day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return day;
                error = "must be a date written yyyy-MM-dd.";
                return null;
            case CanopyFlowFieldKind.Time:
                if (value is TimeSpan clock && clock >= TimeSpan.Zero && clock < TimeSpan.FromDays(1) && clock.Ticks % TimeSpan.TicksPerMinute == 0)
                    return clock.Hours.ToString("00", CultureInfo.InvariantCulture) + ":" + clock.Minutes.ToString("00", CultureInfo.InvariantCulture);
                if (value is string time && TimeShape.IsMatch(time)) return time;
                error = "must be a time written HH:mm.";
                return null;
            case CanopyFlowFieldKind.DateTime:
                if (value is DateTimeOffset offset) return FormatMoment(offset);
                if (value is DateTime moment) return FormatMoment(new DateTimeOffset(moment.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(moment, DateTimeKind.Utc) : moment.ToUniversalTime()));
                if (value is string iso && TryParseMoment(iso, out var parsed)) return FormatMoment(parsed);
                error = "must be an ISO 8601 moment with Z or an offset.";
                return null;
            case CanopyFlowFieldKind.Duration:
                if (value is TimeSpan span && span >= TimeSpan.Zero && span.Ticks % TimeSpan.TicksPerSecond == 0) return FormatDuration(span);
                if (value is string duration && TryParseDuration(duration, out var read)) return FormatDuration(read);
                error = "must be a non-negative ISO 8601 duration of whole seconds, such as PT15M.";
                return null;
            case CanopyFlowFieldKind.Select:
            case CanopyFlowFieldKind.Choice:
            case CanopyFlowFieldKind.Lookup:
                if (TryScalar(value, out var choice) && (field.Kind == CanopyFlowFieldKind.Lookup && field.Options.Count == 0 || IsOption(field, choice))) return choice;
                error = "must be one of the field's option values.";
                return null;
            case CanopyFlowFieldKind.MultiChoice: {
                if (value is string || !(value is IEnumerable items)) { error = "must be a list of the field's option values."; return null; }
                var chosen = new List<object>();
                foreach (var item in items) {
                    if (!TryScalar(item, out var option) || !IsOption(field, option)) { error = "must be a list of the field's option values."; return null; }
                    foreach (var earlier in chosen) if (SameScalar(earlier, option)) { error = "lists an option twice."; return null; }
                    chosen.Add(option);
                }

                return chosen;
            }
            case CanopyFlowFieldKind.List: {
                if (value is string || !(value is IEnumerable rows)) { error = "must be a list of texts."; return null; }
                var list = new List<object>();
                foreach (var row in rows) {
                    if (!(row is string line)) { error = "must be a list of texts."; return null; }
                    list.Add(line);
                }

                if (list.Count > MaxItems) { error = "holds at most 1000 rows."; return null; }
                return list;
            }
            case CanopyFlowFieldKind.Custom: {
                if (TryScalar(value, out var scalar)) return scalar;
                if (value is string || !(value is IEnumerable values)) { error = "must be text, a number, true or false, or a list of them."; return null; }
                var list = new List<object>();
                foreach (var item in values) {
                    if (!TryScalar(item, out var element)) { error = "must be text, a number, true or false, or a list of them."; return null; }
                    list.Add(element);
                }

                if (list.Count > MaxItems) { error = "holds at most 1000 items."; return null; }
                return list;
            }
            default:
                error = "cannot carry a value: secrets reach the host only through the submit handler.";
                return null;
        }
    }

    private static bool IsOption(CanopyFlowField field, object value) {
        foreach (var option in field.Options) if (option != null && SameScalar(option.Value, value)) return true;
        return false;
    }

    /// <summary>
    /// A value as conditions read it, without a field kind: null, a string, a double, a boolean, or a list of them. Dates
    /// become ISO 8601 UTC text and time spans ISO 8601 durations, as the document writes them.
    /// </summary>
    internal static object? Generic(object? value, int depth = 0) {
        switch (value) {
            case null: return null;
            case string text: return text;
            case bool flag: return flag;
            case DateTimeOffset offset: return FormatMoment(offset);
            case DateTime moment: return FormatMoment(new DateTimeOffset(moment.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(moment, DateTimeKind.Utc) : moment.ToUniversalTime()));
            case TimeSpan span: return span >= TimeSpan.Zero && span.Ticks % TimeSpan.TicksPerSecond == 0 ? FormatDuration(span) : null;
            case IEnumerable items when depth == 0: {
                var list = new List<object?>();
                foreach (var item in items) list.Add(Generic(item, 1));
                return list;
            }
        }

        if (TryScalar(value, out var scalar)) return scalar;
        if (value is double || value is float) return null;
        return Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    /// <summary>Writes a canonical value (<see cref="Canonical"/> or a scalar).</summary>
    internal static void Write(CanopyJsonWriter writer, object? value) {
        switch (value) {
            case null: writer.Null(); break;
            case string text: writer.String(text); break;
            case bool flag: writer.Boolean(flag); break;
            case double number: writer.Number(number); break;
            case IList list:
                writer.BeginArray();
                foreach (var item in list) Write(writer, item);
                writer.EndArray();
                break;
            default: throw new InvalidOperationException("A flow value must be text, a number, true or false, or a list of them.");
        }
    }
}
