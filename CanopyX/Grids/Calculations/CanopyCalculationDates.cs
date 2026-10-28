using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace CanopyX;

/// <summary>Strict ISO date reading and UTC-only date operations, with no ambient culture or zone.</summary>
internal static class CanopyCalculationDates {
    private static readonly Regex Shape = new Regex(@"\A([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,7}))?)?(Z|[+-][0-9]{2}:[0-9]{2}))?\z", RegexOptions.CultureInvariant);

    internal static CanopyCalculatedValue Evaluate(string operation, object?[] values) {
        if (!(values[0] is string unit)) return CanopyCalculationNode.Error("type");
        if (!(values[1] is string start) || values.Length == 3 && !(values[2] is string)) return CanopyCalculationNode.Error("date");
        if (!TryRead(start, out var date)) return CanopyCalculationNode.Error("date");
        unit = unit.ToLowerInvariant();
        if (operation == "DATEPART") {
            switch (unit) {
                case "year": return Number(date.Year);
                case "quarter": return Number((date.Month - 1) / 3 + 1);
                case "month": return Number(date.Month);
                case "day": return Number(date.Day);
                case "hour": return Number(date.Hour);
                case "minute": return Number(date.Minute);
                case "second": return Number(date.Second);
                case "weekday": return Number(((int)date.DayOfWeek + 6) % 7 + 1);
                default: return CanopyCalculationNode.Error("date");
            }
        }
        if (!TryRead((string)values[2]!, out var end)) return CanopyCalculationNode.Error("date");
        double milliseconds = (end.Ticks - date.Ticks) / TimeSpan.TicksPerMillisecond;
        switch (unit) {
            case "day": return Number(milliseconds / 86400000);
            case "hour": return Number(milliseconds / 3600000);
            case "minute": return Number(milliseconds / 60000);
            case "second": return Number(milliseconds / 1000);
            case "millisecond": return Number(milliseconds);
            default: return CanopyCalculationNode.Error("date");
        }
    }

    private static CanopyCalculatedValue Number(double value) => CanopyCalculationNode.Result(value);

    /// <summary>Reads the strict ISO date contract shared by date functions and calculated date columns.
    /// One to seven fractional digits are accepted and truncated to UTC milliseconds.</summary>
    internal static bool TryRead(string text, out DateTime result) {
        result = default;
        var match = Shape.Match(text);
        if (!match.Success) return false;
        int Part(int group) => match.Groups[group].Success ? int.Parse(match.Groups[group].Value, CultureInfo.InvariantCulture) : 0;
        var hour = Part(4); var minute = Part(5); var second = Part(6);
        if (hour > 23 || minute > 59 || second > 59) return false;
        var zone = match.Groups[8].Value;
        var offset = 0;
        if (zone.Length > 1) {
            var zoneHour = int.Parse(zone.Substring(1, 2), CultureInfo.InvariantCulture);
            var zoneMinute = int.Parse(zone.Substring(4, 2), CultureInfo.InvariantCulture);
            if (zoneHour > 14 || zoneMinute > 59 || zoneHour * 60 + zoneMinute > 840) return false;
            offset = (zoneHour * 60 + zoneMinute) * (zone[0] == '-' ? -1 : 1);
        }
        try {
            var milliseconds = match.Groups[7].Success ? int.Parse(match.Groups[7].Value.PadRight(3, '0').Substring(0, 3), CultureInfo.InvariantCulture) : 0;
            result = new DateTime(Part(1), Part(2), Part(3), hour, minute, second, milliseconds, DateTimeKind.Utc).AddMinutes(-offset);
            return true;
        } catch (ArgumentOutOfRangeException) { return false; }
    }
}
