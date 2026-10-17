using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyRecurrence {
    /// <summary>
    /// Expands the series that starts at <paramref name="start"/>: its occurrences in order, as moments with the series' time zone
    /// offset, from the series start (which always counts first) to the end of the rule, or within a range.
    /// </summary>
    /// <param name="start">The series start: an unspecified time is a wall time in <paramref name="zone"/>; a UTC or local time is a moment whose exact instant is kept.</param>
    /// <param name="zone">The series' time zone, whose wall-clock time the occurrences keep; UTC for all-day series.</param>
    /// <param name="from">The first moment of the range: occurrences that start earlier are left out (they still count toward <see cref="Count"/>);
    /// to keep occurrences that are still running at a range's start, as the browser shows them, pass that start minus the occurrences' duration. Null for none.</param>
    /// <param name="to">The end of the range, exclusive: occurrences that start at or after it are left out. Null for none.</param>
    /// <param name="exceptions">Excluded occurrences (<c>EXDATE</c>), as a calendar's <c>exceptions</c> column holds them: ISO instants
    /// (an instant without an offset is a wall time in <paramref name="zone"/>) remove the occurrence that starts then, and
    /// <c>yyyy-MM-dd</c> dates remove every occurrence that starts on that day; separated by commas, semicolons or white space, at most 1000. Null for none.</param>
    /// <returns>The occurrences, lazily. A series without an end and without <paramref name="to"/> runs until the walk stops after
    /// 60,000 periods (days, weeks, months or years), as the browser's does, or until the caller stops reading.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="zone"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="to"/> is before <paramref name="from"/>.</exception>
    /// <exception cref="FormatException"><paramref name="exceptions"/> holds something that is neither an ISO instant nor a date.</exception>
    public IEnumerable<DateTimeOffset> Occurrences(DateTime start, TimeZoneInfo zone, DateTimeOffset? from = null, DateTimeOffset? to = null, string? exceptions = null) {
        if (zone == null) throw new ArgumentNullException(nameof(zone));
        return Occurrences(Wall(start, zone), Moment(start, zone), zone, from, to, exceptions, nameof(to));
    }

    /// <summary>Expands the series that starts at a moment, as <see cref="Occurrences(DateTime, TimeZoneInfo, DateTimeOffset?, DateTimeOffset?, string?)"/> does.</summary>
    /// <param name="start">The series start, whose exact instant is kept; its wall-clock time in <paramref name="zone"/> is the time later occurrences keep.</param>
    /// <param name="zone">The series' time zone; UTC for all-day series.</param>
    /// <param name="from">The first moment of the range, or null.</param>
    /// <param name="to">The end of the range, exclusive, or null.</param>
    /// <param name="exceptions">Excluded occurrences, as a calendar's <c>exceptions</c> column holds them, or null.</param>
    /// <returns>The occurrences, lazily.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="zone"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="to"/> is before <paramref name="from"/>.</exception>
    /// <exception cref="FormatException"><paramref name="exceptions"/> holds something that is neither an ISO instant nor a date.</exception>
    public IEnumerable<DateTimeOffset> Occurrences(DateTimeOffset start, TimeZoneInfo zone, DateTimeOffset? from = null, DateTimeOffset? to = null, string? exceptions = null) {
        if (zone == null) throw new ArgumentNullException(nameof(zone));
        var first = TimeZoneInfo.ConvertTime(start, zone);
        return Occurrences(first.DateTime, first, zone, from, to, exceptions, nameof(to));
    }

    /// <summary>
    /// Returns the end of the series' last occurrence (its start plus <paramref name="duration"/>), for a host's <c>seriesEnd</c>
    /// column, which lets a server find the series that reach into a range; null for a series without an end.
    /// </summary>
    /// <param name="start">The series start: an unspecified time is a wall time in <paramref name="zone"/>; a UTC or local time is a moment whose exact instant is kept.</param>
    /// <param name="duration">How long each occurrence lasts; zero for markers.</param>
    /// <param name="zone">The series' time zone; UTC for all-day series.</param>
    /// <param name="exceptions">Excluded occurrences, as a calendar's <c>exceptions</c> column holds them, or null.</param>
    /// <returns>The end of the last occurrence, with the zone's offset; the end of the first when exceptions remove every occurrence; null when the rule has neither <see cref="Count"/> nor an until bound.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="zone"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="duration"/> is negative.</exception>
    /// <exception cref="FormatException"><paramref name="exceptions"/> holds something that is neither an ISO instant nor a date.</exception>
    public DateTimeOffset? SeriesEnd(DateTime start, TimeSpan duration, TimeZoneInfo zone, string? exceptions = null) {
        if (zone == null) throw new ArgumentNullException(nameof(zone));
        return LastEnd(Wall(start, zone), Moment(start, zone), duration, zone, exceptions);
    }

    /// <summary>Returns the end of the last occurrence of the series that starts at a moment, as <see cref="SeriesEnd(DateTime, TimeSpan, TimeZoneInfo, string?)"/> does.</summary>
    /// <param name="start">The series start.</param>
    /// <param name="duration">How long each occurrence lasts; zero for markers.</param>
    /// <param name="zone">The series' time zone; UTC for all-day series.</param>
    /// <param name="exceptions">Excluded occurrences, as a calendar's <c>exceptions</c> column holds them, or null.</param>
    /// <returns>The end of the last occurrence, or null for a series without an end.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="zone"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="duration"/> is negative.</exception>
    /// <exception cref="FormatException"><paramref name="exceptions"/> holds something that is neither an ISO instant nor a date.</exception>
    public DateTimeOffset? SeriesEnd(DateTimeOffset start, TimeSpan duration, TimeZoneInfo zone, string? exceptions = null) {
        if (zone == null) throw new ArgumentNullException(nameof(zone));
        var first = TimeZoneInfo.ConvertTime(start, zone);
        return LastEnd(first.DateTime, first, duration, zone, exceptions);
    }

    private DateTimeOffset? LastEnd(DateTime wallStart, DateTimeOffset? first, TimeSpan duration, TimeZoneInfo zone, string? exceptions) {
        if (duration < TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(duration), duration, "A duration cannot be negative.");
        if (!_count.HasValue && !_until.HasValue) return null;
        DateTimeOffset? last = null;
        foreach (var occurrence in Occurrences(wallStart, first, zone, null, null, exceptions, nameof(exceptions))) last = occurrence;
        var end = (last ?? first ?? CanopyRecurrenceZone.Resolve(wallStart, zone)).Add(duration);
        return TimeZoneInfo.ConvertTime(end, zone);
    }

    private IEnumerable<DateTimeOffset> Occurrences(DateTime wallStart, DateTimeOffset? first, TimeZoneInfo zone, DateTimeOffset? from, DateTimeOffset? to, string? exceptions, string parameter) {
        if (from.HasValue && to.HasValue && to.Value < from.Value) throw new ArgumentException("The end of the range is before its start.", parameter);
        return Expand(DateTime.SpecifyKind(wallStart, DateTimeKind.Unspecified), first, zone, from, to, CanopyRecurrenceExclusions.Parse(exceptions, zone));
    }

    private static DateTime Wall(DateTime start, TimeZoneInfo zone) => start.Kind switch {
        DateTimeKind.Utc => TimeZoneInfo.ConvertTimeFromUtc(start, zone),
        DateTimeKind.Local => TimeZoneInfo.ConvertTime(start, zone),
        _ => start
    };

    /// <summary>An explicitly supplied moment keeps its identity, including the second occurrence of a repeated wall time.</summary>
    private static DateTimeOffset? Moment(DateTime start, TimeZoneInfo zone) => start.Kind == DateTimeKind.Unspecified
        ? (DateTimeOffset?)null : TimeZoneInfo.ConvertTime(new DateTimeOffset(start), zone);

    private IEnumerable<DateTimeOffset> Expand(DateTime wallStart, DateTimeOffset? first, TimeZoneInfo zone, DateTimeOffset? from, DateTimeOffset? to, CanopyRecurrenceExclusions exclusions) {
        var time = wallStart.TimeOfDay;
        // No period after this wall date can hold an occurrence that is still returned; bounds near the end of the calendar clamp.
        DateTime? lastDate = to.HasValue && to.Value < Far ? NextDay(TimeZoneInfo.ConvertTime(to.Value, zone).Date) : (DateTime?)null;
        // Dates more than a day before the range are counted (for COUNT) without resolving their moment.
        DateTime? firstDate = from.HasValue && from.Value > Near ? TimeZoneInfo.ConvertTime(from.Value, zone).Date.AddDays(-1) : (DateTime?)null;
        DateTime? untilDate = null;
        DateTimeOffset? untilInstant = null;
        if (_until.HasValue) {
            if (_untilIsDate) untilDate = _until.Value.Date;
            else untilInstant = _until.Value.Kind == DateTimeKind.Utc ? new DateTimeOffset(_until.Value, TimeSpan.Zero) : CanopyRecurrenceZone.Resolve(_until.Value, zone);
            var bound = NextDay(untilDate ?? TimeZoneInfo.ConvertTime(untilInstant!.Value, zone).Date);
            if (!lastDate.HasValue || bound < lastDate.Value) lastDate = bound;
        }
        var generated = 0;
        foreach (var date in Dates(wallStart.Date, lastDate)) {
            if (untilDate.HasValue && date > untilDate.Value) yield break;
            if (firstDate.HasValue && date < firstDate.Value && !untilInstant.HasValue) {
                if (_count.HasValue && ++generated >= _count.Value) yield break;
                continue;
            }
            var occurrence = first.HasValue && date == wallStart.Date ? first.Value : CanopyRecurrenceZone.Resolve(date + time, zone);
            if (untilInstant.HasValue && occurrence > untilInstant.Value) yield break;
            generated++;
            if (to.HasValue && occurrence >= to.Value) yield break;
            if (!(from.HasValue && occurrence < from.Value || exclusions.Removes(occurrence, date))) yield return occurrence;
            // The last occurrence COUNT allows ends the walk at once, so a rule that matches rarely is not scanned to the year 9999.
            if (_count.HasValue && generated >= _count.Value) yield break;
        }
    }

    private static readonly DateTimeOffset Far = DateTimeOffset.MaxValue.AddDays(-2);
    private static readonly DateTimeOffset Near = DateTimeOffset.MinValue.AddDays(2);
    private static DateTime NextDay(DateTime date) => date >= DateTime.MaxValue.Date ? date : date.AddDays(1);

    /// <summary>The most periods one expansion walks, as in the browser (60,000 days, weeks, months or years).</summary>
    private const int MaxPeriods = 60000;

    /// <summary>The series' dates in order: the start, then every later date the rule makes, period by period.</summary>
    private IEnumerable<DateTime> Dates(DateTime start, DateTime? lastDate) {
        yield return start;
        var days = new List<CanopyRecurrenceDay>(_days);
        var monthDays = new List<int>(_monthDays);
        var months = new List<int>(_months);
        // Without days the rule repeats on the start's weekday, day of the month, or date.
        if (Frequency == CanopyRecurrenceFrequency.Weekly && days.Count == 0) days.Add(new CanopyRecurrenceDay(start.DayOfWeek));
        if ((Frequency == CanopyRecurrenceFrequency.Monthly || Frequency == CanopyRecurrenceFrequency.Yearly) && days.Count == 0 && monthDays.Count == 0) {
            monthDays.Add(start.Day);
            if (Frequency == CanopyRecurrenceFrequency.Yearly && months.Count == 0) months.Add(start.Month);
        }
        var period = Frequency switch {
            CanopyRecurrenceFrequency.Daily => start,
            CanopyRecurrenceFrequency.Weekly => start.AddDays(-((7 + (int)start.DayOfWeek - (int)WeekStart) % 7)),
            CanopyRecurrenceFrequency.Monthly => new DateTime(start.Year, start.Month, 1),
            _ => new DateTime(start.Year, 1, 1)
        };
        var monthScope = Frequency == CanopyRecurrenceFrequency.Monthly || months.Count > 0;
        var candidates = new List<DateTime>();
        var chosen = new List<DateTime>();
        for (var periods = 0; periods < MaxPeriods && (!lastDate.HasValue || period <= lastDate.Value); periods++) {
            candidates.Clear();
            var length = Frequency switch {
                CanopyRecurrenceFrequency.Daily => 1,
                CanopyRecurrenceFrequency.Weekly => 7,
                CanopyRecurrenceFrequency.Monthly => DateTime.DaysInMonth(period.Year, period.Month),
                _ => DateTime.IsLeapYear(period.Year) ? 366 : 365
            };
            for (var offset = 0; offset < length; offset++) {
                if (DateTime.MaxValue.Date.Subtract(period).Days < offset) break;
                var day = period.AddDays(offset);
                if (Matches(day, days, monthDays, months, monthScope)) candidates.Add(day);
            }
            Choose(candidates, chosen);
            foreach (var day in chosen) if (day > start) yield return day;
            if (!TryAdvance(ref period)) yield break;
        }
    }

    private static bool Matches(DateTime day, List<CanopyRecurrenceDay> days, List<int> monthDays, List<int> months, bool monthScope) {
        if (months.Count > 0 && !months.Contains(day.Month)) return false;
        var monthLength = DateTime.DaysInMonth(day.Year, day.Month);
        if (monthDays.Count > 0) {
            var hit = false;
            foreach (var monthDay in monthDays) if (monthDay == day.Day || monthDay < 0 && monthLength + 1 + monthDay == day.Day) { hit = true; break; }
            if (!hit) return false;
        }
        if (days.Count == 0) return true;
        foreach (var entry in days) {
            if (entry.Day != day.DayOfWeek) continue;
            if (entry.Ordinal == 0) return true;
            // A numbered weekday counts within the month, or within the year for a yearly rule without months.
            var index = monthScope ? day.Day : day.DayOfYear;
            var length = monthScope ? monthLength : DateTime.IsLeapYear(day.Year) ? 366 : 365;
            if (entry.Ordinal == (index - 1) / 7 + 1 || entry.Ordinal == -((length - index) / 7 + 1)) return true;
        }
        return false;
    }

    /// <summary>The period's days that count: all of them, or those at the positions (<c>BYSETPOS</c>), in order.</summary>
    private void Choose(List<DateTime> candidates, List<DateTime> chosen) {
        chosen.Clear();
        if (_positions.Count == 0) { chosen.AddRange(candidates); return; }
        foreach (var position in _positions) {
            var index = position > 0 ? position - 1 : candidates.Count + position;
            if (index >= 0 && index < candidates.Count && !chosen.Contains(candidates[index])) chosen.Add(candidates[index]);
        }
        chosen.Sort();
    }

    private bool TryAdvance(ref DateTime period) {
        try {
            period = Frequency switch {
                CanopyRecurrenceFrequency.Daily => period.AddDays(_interval),
                CanopyRecurrenceFrequency.Weekly => period.AddDays(7.0 * _interval),
                CanopyRecurrenceFrequency.Monthly => period.AddMonths(_interval),
                _ => period.AddYears(_interval)
            };
            return true;
        } catch (ArgumentOutOfRangeException) {
            return false;
        }
    }
}
