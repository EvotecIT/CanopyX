using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace CanopyX;

// A rule as a short sentence ("Every week, on Monday and Wednesday, at 09:00, 10 times"). The browser's calDescribe writes the
// same sentences from the same labels; tests/fixtures/recurrence-descriptions.json holds the vectors both check.
public sealed partial class CanopyRecurrence {
    private static readonly Regex Weekday = new Regex(@"^dddd[,\s]*|[,\s]*dddd$", RegexOptions.CultureInvariant);

    /// <summary>
    /// Describes the rule as a short sentence in a culture's words, such as "Every week, on Monday and Wednesday, at 09:00, 10 times"
    /// or "On weekdays, at 04:00". A rule the sentences cannot say exactly is returned as its rule text (<see cref="ToString"/>).
    /// </summary>
    /// <remarks>
    /// Weekday and month names, the day and month of a yearly rule and the date of <c>UNTIL</c> come from <paramref name="culture"/>;
    /// the words around them from <paramref name="labels"/> (<c>CalendarRecurrence…</c>). The sentence names the weekdays (Monday to
    /// Friday is "weekdays", Saturday and Sunday "weekends", three or more consecutive days a range), days of the month, the last
    /// day of the month, numbered weekdays (first to fifth and last, also as <c>BYSETPOS</c> over one weekday), months, the start's
    /// time, <c>COUNT</c> or <c>UNTIL</c>, and how many dates <paramref name="exceptions"/> removes. Plain weekdays in a monthly or
    /// yearly rule, numbered weekdays of a whole year, <c>BYSETPOS</c> over several days, days counted from the month's end other
    /// than the last, and every second day on given weekdays fall back to the rule text.
    /// </remarks>
    /// <param name="start">The series start, a wall time in the series' time zone: its weekday, day and month fill in what the rule leaves out.</param>
    /// <param name="culture">The culture of names, dates and plural forms.</param>
    /// <param name="labels">The words; English when null.</param>
    /// <param name="allDay">Whether the series is all-day, so the sentence names no time.</param>
    /// <param name="exceptions">The series' exceptions column text (<c>EXDATE</c>), as <see cref="Occurrences(DateTime, TimeZoneInfo, DateTimeOffset?, DateTimeOffset?, string?)"/> reads it.</param>
    /// <returns>The sentence, or the rule text.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="culture"/> is null.</exception>
    /// <exception cref="FormatException"><paramref name="exceptions"/> is not a list of dates and date-times.</exception>
    public string Describe(DateTime start, CultureInfo culture, CanopyLabels? labels = null, bool allDay = false, string? exceptions = null) {
        if (culture == null) throw new ArgumentNullException(nameof(culture));
        labels ??= new CanopyLabels();
        var excluded = CanopyRecurrenceExclusions.Parse(exceptions, TimeZoneInfo.Utc).Count;
        return Sentence(start, culture, labels, allDay, excluded) ?? ToString();
    }

    private string? Sentence(DateTime start, CultureInfo culture, CanopyLabels labels, bool allDay, int excluded) {
        var names = culture.DateTimeFormat;
        var frequency = Frequency;
        var weekdays = _days.Where(day => day.Ordinal == 0).Select(day => day.Day).ToList();
        var numbered = _days.Where(day => day.Ordinal != 0).ToList();
        if (_positions.Count > 0) {
            if (_positions.Count != 1 || weekdays.Count != 1 || numbered.Count > 0) return null;
            numbered.Add(new CanopyRecurrenceDay(weekdays[0], _positions[0]));
            weekdays.Clear();
        }

        var monthly = frequency == CanopyRecurrenceFrequency.Monthly || frequency == CanopyRecurrenceFrequency.Yearly && _months.Count > 0;
        if (numbered.Any(day => day.Ordinal < -1 || day.Ordinal > 5) || numbered.Count > 0 && !monthly) return null;
        if (weekdays.Count > 0 && (frequency == CanopyRecurrenceFrequency.Monthly || frequency == CanopyRecurrenceFrequency.Yearly)) return null;
        if (_monthDays.Count > 0 && (_days.Count > 0 || !monthly || (_monthDays.Count > 1 ? _monthDays.Any(day => day < 0) : _monthDays[0] < -1))) return null;
        if (frequency == CanopyRecurrenceFrequency.Daily && weekdays.Count > 0) {
            if (_interval > 1) return null;
            frequency = CanopyRecurrenceFrequency.Weekly;
        }

        var ordinals = labels.CalendarRecurrenceOrdinals.Split('|');
        if (numbered.Count > 0 && ordinals.Length != 6) return null;
        string List(IEnumerable<string> items) {
            var all = items.ToList();
            return all.Count < 2 ? all[0] : labels.CalendarRecurrenceList.Replace("{items}", string.Join(", ", all.Take(all.Count - 1))).Replace("{last}", all[all.Count - 1]);
        }
        string Count(string template, int count) => CanopyPlural.Pick(template, count, culture).Replace("{count}", count.ToString("N0", culture));

        var days = string.Empty;
        var saysRepeat = false;
        if (frequency == CanopyRecurrenceFrequency.Weekly) {
            var set = (weekdays.Count > 0 ? weekdays : new List<DayOfWeek> { start.DayOfWeek }).Distinct().OrderBy(MondayFirst).ToList();
            var key = string.Join(",", set.Select(day => ((int)day).ToString(CultureInfo.InvariantCulture)));
            saysRepeat = _interval == 1;
            if (key == "1,2,3,4,5") days = labels.CalendarRecurrenceWeekdays;
            else if (key == "6,0") days = labels.CalendarRecurrenceWeekends;
            else if (set.Count > 2 && MondayFirst(set[set.Count - 1]) - MondayFirst(set[0]) == set.Count - 1)
                days = labels.CalendarRecurrenceDayRange.Replace("{first}", names.DayNames[(int)set[0]]).Replace("{last}", names.DayNames[(int)set[set.Count - 1]]);
            else {
                days = labels.CalendarRecurrenceOn.Replace("{days}", List(set.Select(day => names.DayNames[(int)day])));
                saysRepeat = false;
            }
        } else if (frequency != CanopyRecurrenceFrequency.Daily) {
            if (numbered.Count > 0)
                days = labels.CalendarRecurrenceOn.Replace("{days}", List(numbered.Select(day => labels.CalendarRecurrenceNth
                    .Replace("{ordinal}", ordinals[day.Ordinal < 0 ? 5 : day.Ordinal - 1]).Replace("{day}", names.DayNames[(int)day.Day]))));
            else if (_monthDays.Count == 1 && _monthDays[0] == -1) days = labels.CalendarRecurrenceLastDay;
            else if (_monthDays.Count > 0 || monthly) {
                var list = _monthDays.Count > 0 ? _monthDays.Distinct().OrderBy(day => day).ToList() : new List<int> { start.Day };
                days = CanopyPlural.Pick(labels.CalendarRecurrenceMonthDays, list.Count, culture).Replace("{days}", List(list.Select(day => day.ToString(CultureInfo.InvariantCulture))));
            } else days = labels.CalendarRecurrenceOnDate.Replace("{date}", new DateTime(2000, start.Month, start.Day).ToString(names.MonthDayPattern, culture));
        }

        var parts = new List<string>();
        if (!saysRepeat) parts.Add(_interval == 1 ? Every(labels, frequency) : Count(EveryInterval(labels, frequency), _interval));
        if (_months.Count > 0) parts.Add(labels.CalendarRecurrenceInMonths.Replace("{months}", List(_months.Distinct().OrderBy(month => month).Select(month => names.MonthNames[month - 1]))));
        if (days.Length > 0) parts.Add(days);
        if (!allDay) parts.Add(labels.CalendarRecurrenceAt.Replace("{time}", start.ToString("HH:mm", CultureInfo.InvariantCulture)));
        if (_count.HasValue) parts.Add(Count(labels.CalendarRecurrenceTimes, _count.Value));
        if (_until.HasValue) parts.Add(labels.CalendarRecurrenceUntil.Replace("{date}", _until.Value.Date.ToString(Weekday.Replace(names.LongDatePattern, string.Empty), culture)));
        if (excluded > 0) parts.Add(Count(labels.CalendarRecurrenceExcept, excluded));
        var sentence = string.Join(", ", parts);
        return char.ToUpper(sentence[0], culture) + sentence.Substring(1);
    }

    private static int MondayFirst(DayOfWeek day) => ((int)day + 6) % 7;

    private static string Every(CanopyLabels labels, CanopyRecurrenceFrequency frequency) => frequency switch {
        CanopyRecurrenceFrequency.Daily => labels.CalendarRecurrenceDaily,
        CanopyRecurrenceFrequency.Weekly => labels.CalendarRecurrenceWeekly,
        CanopyRecurrenceFrequency.Monthly => labels.CalendarRecurrenceMonthly,
        _ => labels.CalendarRecurrenceYearly
    };

    private static string EveryInterval(CanopyLabels labels, CanopyRecurrenceFrequency frequency) => frequency switch {
        CanopyRecurrenceFrequency.Daily => labels.CalendarRecurrenceDailyInterval,
        CanopyRecurrenceFrequency.Weekly => labels.CalendarRecurrenceWeeklyInterval,
        CanopyRecurrenceFrequency.Monthly => labels.CalendarRecurrenceMonthlyInterval,
        _ => labels.CalendarRecurrenceYearlyInterval
    };
}
