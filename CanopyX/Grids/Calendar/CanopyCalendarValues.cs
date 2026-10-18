using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Checks and wire forms shared by the calendar's settings: times of day, weekday lists, names and moments.</summary>
internal static class CanopyCalendarValues {
    internal static readonly DayOfWeek[] WorkDays = { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday };

    /// <summary>A time of day in whole minutes, 00:00 to 23:59, or to 24:00 when <paramref name="endOfDay"/> allows it.</summary>
    internal static TimeSpan? Time(TimeSpan? value, string parameter, bool endOfDay) {
        if (!value.HasValue) return null;
        var time = value.Value;
        if (time.Ticks % TimeSpan.TicksPerMinute != 0 || time < TimeSpan.Zero || time > TimeSpan.FromDays(1) || !endOfDay && time == TimeSpan.FromDays(1))
            throw new ArgumentOutOfRangeException(parameter, time, endOfDay ? "A time is whole minutes from 00:00 to 24:00." : "A time is whole minutes from 00:00 to 23:59.");
        return time;
    }

    /// <summary>The wire form of a time of day: <c>HH:mm</c>, with <c>24:00</c> for the end of the day.</summary>
    internal static string Format(TimeSpan time) => ((int)time.TotalHours).ToString("00", CultureInfo.InvariantCulture) + ":" + time.Minutes.ToString("00", CultureInfo.InvariantCulture);

    /// <summary>A label of 1 to 256 visible characters, or null.</summary>
    internal static string? Label(string? value, string parameter) =>
        value != null && (value.Trim().Length == 0 || value.Length > 256) ? throw new ArgumentException("A label needs 1 to 256 visible characters.", parameter) : value;

    /// <summary>Checks a weekday list: known, distinct days, at least <paramref name="minimum"/> and at most <paramref name="maximum"/>.</summary>
    internal static void Days(IList<DayOfWeek> days, int minimum, int maximum, string what) {
        if (days.Count < minimum || days.Count > maximum) throw new InvalidOperationException(what + " lists " + minimum + " to " + maximum + " weekdays.");
        var seen = new HashSet<DayOfWeek>();
        foreach (var day in days) {
            if (day < DayOfWeek.Sunday || day > DayOfWeek.Saturday || !seen.Add(day)) throw new InvalidOperationException(what + " lists known weekdays, each once.");
        }
    }

    /// <summary>Whether a weekday list is Monday to Friday in order, the default of working hours and availability.</summary>
    internal static bool IsWorkWeek(IList<DayOfWeek> days) {
        if (days.Count != WorkDays.Length) return false;
        for (var index = 0; index < days.Count; index++) if (days[index] != WorkDays[index]) return false;
        return true;
    }

    internal static void WriteDays(CanopyJsonWriter writer, string name, IList<DayOfWeek> days) {
        writer.Name(name).BeginArray();
        foreach (var day in days) writer.Number((int)day);
        writer.EndArray();
    }

    /// <summary>A moment in UTC: a local time is converted, an unspecified one is taken as UTC.</summary>
    internal static DateTime Utc(DateTime value) => value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    /// <summary>ISO 8601 UTC, with milliseconds only when they are not zero.</summary>
    internal static string Iso(DateTime value) =>
        value.ToString(value.Millisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>The camel-case wire name of an enum member (<c>month</c>, <c>weekList</c>).</summary>
    internal static string Name<TEnum>(TEnum value) where TEnum : struct, Enum {
        var name = value.ToString();
        return char.ToLowerInvariant(name[0]) + name.Substring(1);
    }

    /// <summary>The wire form of a date: <c>yyyy-MM-dd</c>.</summary>
    internal static string Date(DateTime value) => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
