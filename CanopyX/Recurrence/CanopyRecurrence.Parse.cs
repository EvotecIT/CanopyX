using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

public sealed partial class CanopyRecurrence {
    private const int MaxRuleLength = 1024;
    private static readonly string[] UntilFormats = {
        "yyyyMMdd", "yyyyMMdd'T'HHmmss", "yyyy-MM-dd", "yyyy-MM-dd'T'HH:mm:ss"
    };

    /// <summary>
    /// Reads rule text such as <c>FREQ=MONTHLY;BYDAY=-1FR</c>, with or without the <c>RRULE:</c> prefix. Part names and values
    /// are case-insensitive. <c>UNTIL</c> is <c>YYYYMMDD</c>, <c>YYYYMMDDTHHMMSSZ</c> (UTC), <c>YYYYMMDDTHHMMSS</c> (a wall time in
    /// the series' time zone), or ISO <c>YYYY-MM-DD[THH:MM:SS[Z]]</c>.
    /// </summary>
    /// <param name="text">The rule text.</param>
    /// <returns>The rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="text"/> is null.</exception>
    /// <exception cref="FormatException">The text is not a rule of the supported subset: a missing or unknown frequency, an unknown or
    /// repeated part, a value out of range, <c>COUNT</c> with <c>UNTIL</c>, a numbered weekday in a daily or weekly rule, or days of the
    /// month in a weekly rule.</exception>
    public static CanopyRecurrence Parse(string text) {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var error = TryRead(text, out var rule);
        return rule ?? throw new FormatException("Invalid recurrence rule: " + error);
    }

    /// <summary>Reads rule text as <see cref="Parse"/> does, without throwing.</summary>
    /// <param name="text">The rule text.</param>
    /// <param name="rule">The rule, or null when the text is not a rule of the supported subset.</param>
    /// <returns>Whether the text is a rule of the supported subset.</returns>
    public static bool TryParse(string? text, out CanopyRecurrence? rule) {
        if (text == null) { rule = null; return false; }
        TryRead(text, out rule);
        return rule != null;
    }

    private static string? TryRead(string text, out CanopyRecurrence? rule) {
        rule = null;
        // The browser reads at most 1024 characters too, so both read the same rules.
        if (text.Length > MaxRuleLength) return "a rule is at most 1024 characters.";
        var body = text.Trim();
        if (body.StartsWith("RRULE:", StringComparison.OrdinalIgnoreCase)) body = body.Substring(6);
        if (body.Length == 0) return "the rule is empty.";
        var parts = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var part in body.Split(';')) {
            var equals = part.IndexOf('=');
            if (equals <= 0 || equals == part.Length - 1) return "every part is NAME=VALUE.";
            var name = part.Substring(0, equals).Trim().ToUpperInvariant();
            if (parts.ContainsKey(name)) return name + " appears more than once.";
            parts[name] = part.Substring(equals + 1).Trim();
        }
        if (!parts.TryGetValue("FREQ", out var frequencyText)) return "FREQ is required.";
        CanopyRecurrenceFrequency frequency;
        switch (frequencyText.ToUpperInvariant()) {
            case "DAILY": frequency = CanopyRecurrenceFrequency.Daily; break;
            case "WEEKLY": frequency = CanopyRecurrenceFrequency.Weekly; break;
            case "MONTHLY": frequency = CanopyRecurrenceFrequency.Monthly; break;
            case "YEARLY": frequency = CanopyRecurrenceFrequency.Yearly; break;
            default: return "FREQ is DAILY, WEEKLY, MONTHLY or YEARLY.";
        }
        var result = new CanopyRecurrence(frequency);
        foreach (var part in parts) {
            var error = part.Key switch {
                "FREQ" => null,
                "INTERVAL" => ReadNumber(part.Value, 1, 9999, out var interval) ? Set(() => result._interval = interval) : "INTERVAL is 1 to 9999.",
                "COUNT" => ReadNumber(part.Value, 1, 9999, out var count) ? Set(() => result._count = count) : "COUNT is 1 to 9999.",
                "UNTIL" => ReadUntil(part.Value, result),
                "BYDAY" => ReadDays(part.Value, result),
                "BYMONTHDAY" => frequency == CanopyRecurrenceFrequency.Weekly ? "BYMONTHDAY cannot be used with FREQ=WEEKLY."
                    : ReadList(part.Value, -31, 31, result._monthDays) ? null : "BYMONTHDAY values are 1 to 31 or -31 to -1.",
                "BYMONTH" => ReadList(part.Value, 1, 12, result._months) ? null : "BYMONTH values are 1 to 12.",
                "BYSETPOS" => ReadList(part.Value, -366, 366, result._positions) ? null : "BYSETPOS values are 1 to 366 or -366 to -1.",
                "WKST" => CanopyRecurrenceDay.TryParseCode(part.Value, out var start) ? Set(() => result.WeekStart = start) : "WKST is a weekday: SU, MO, TU, WE, TH, FR or SA.",
                _ => part.Key + " is not supported."
            };
            if (error != null) return error;
        }
        if (result._count.HasValue && result._until.HasValue) return "COUNT and UNTIL cannot be used together.";
        rule = result;
        return null;
    }

    private static string? Set(Action assign) {
        assign();
        return null;
    }

    private static bool ReadNumber(string text, int minimum, int maximum, out int value) {
        value = 0;
        var digits = text.StartsWith("+", StringComparison.Ordinal) || text.StartsWith("-", StringComparison.Ordinal) ? text.Substring(1) : text;
        if (digits.Length == 0 || digits.Length > 4) return false;
        foreach (var character in digits) if (character < '0' || character > '9') return false;
        value = int.Parse(digits, CultureInfo.InvariantCulture) * (text[0] == '-' ? -1 : 1);
        return value != 0 && value >= minimum && value <= maximum;
    }

    private static bool ReadList(string text, int minimum, int maximum, List<int> values) {
        foreach (var item in text.Split(',')) {
            if (!ReadNumber(item.Trim(), minimum, maximum, out var value)) return false;
            values.Add(value);
        }
        return true;
    }

    private static string? ReadDays(string text, CanopyRecurrence rule) {
        foreach (var raw in text.Split(',')) {
            var item = raw.Trim();
            if (item.Length < 2 || !CanopyRecurrenceDay.TryParseCode(item.Substring(item.Length - 2), out var day)) return "BYDAY values are weekdays such as MO, 2TU or -1FR.";
            var ordinal = 0;
            if (item.Length > 2) {
                var number = item.Substring(0, item.Length - 2);
                if (number.TrimStart('+', '-').Length > 2 || !ReadNumber(number, -53, 53, out ordinal)) return "A numbered weekday's number is 1 to 53 or -53 to -1.";
                if (rule.Frequency != CanopyRecurrenceFrequency.Monthly && rule.Frequency != CanopyRecurrenceFrequency.Yearly) return "Numbered weekdays need FREQ=MONTHLY or FREQ=YEARLY.";
            }
            rule._days.Add(new CanopyRecurrenceDay(day, ordinal));
        }
        return null;
    }

    private static string? ReadUntil(string text, CanopyRecurrence rule) {
        text = text.ToUpperInvariant();
        var utc = text.EndsWith("Z", StringComparison.Ordinal);
        var value = utc ? text.Substring(0, text.Length - 1) : text;
        if (!DateTime.TryParseExact(value, UntilFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var until)) return "UNTIL is YYYYMMDD, YYYYMMDDTHHMMSS[Z] or YYYY-MM-DD[THH:MM:SS[Z]].";
        var date = value.IndexOf('T') < 0;
        if (date && utc) return "A date UNTIL has no time zone.";
        rule._untilIsDate = date;
        rule._until = DateTime.SpecifyKind(until, utc ? DateTimeKind.Utc : DateTimeKind.Unspecified);
        return null;
    }
}
