using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddCalendarDefaults(Dictionary<string, string> defaults) {
        foreach (var entry in new Dictionary<string, string>(StringComparer.Ordinal) {
            [nameof(CalendarEditOccurrence)] = "Edit this occurrence",
            [nameof(CalendarRemoveOccurrence)] = "Remove this occurrence",
            [nameof(CalendarOccurrenceScope)] = "Only {date} changes; other dates of {title} stay as they are.",
            [nameof(CalendarSharedResources)] = "{count} {resources}",
            [nameof(CalendarResourceWindow)] = "{resources} {start}–{end} of {total}",
            [nameof(CalendarRecurrenceDaily)] = "every day",
            [nameof(CalendarRecurrenceDailyInterval)] = "every {count} days",
            [nameof(CalendarRecurrenceWeekly)] = "every week",
            [nameof(CalendarRecurrenceWeeklyInterval)] = "every {count} weeks",
            [nameof(CalendarRecurrenceMonthly)] = "every month",
            [nameof(CalendarRecurrenceMonthlyInterval)] = "every {count} months",
            [nameof(CalendarRecurrenceYearly)] = "every year",
            [nameof(CalendarRecurrenceYearlyInterval)] = "every {count} years",
            [nameof(CalendarRecurrenceOn)] = "on {days}",
            [nameof(CalendarRecurrenceWeekdays)] = "on weekdays",
            [nameof(CalendarRecurrenceWeekends)] = "on weekends",
            [nameof(CalendarRecurrenceDayRange)] = "{first} through {last}",
            [nameof(CalendarRecurrenceList)] = "{items} and {last}",
            [nameof(CalendarRecurrenceMonthDays)] = "[one]on day {days}[other]on days {days}",
            [nameof(CalendarRecurrenceLastDay)] = "on the last day of the month",
            [nameof(CalendarRecurrenceNth)] = "the {ordinal} {day}",
            [nameof(CalendarRecurrenceOrdinals)] = "first|second|third|fourth|fifth|last",
            [nameof(CalendarRecurrenceInMonths)] = "in {months}",
            [nameof(CalendarRecurrenceOnDate)] = "on {date}",
            [nameof(CalendarRecurrenceAt)] = "at {time}",
            [nameof(CalendarRecurrenceTimes)] = "[one]{count} time[other]{count} times",
            [nameof(CalendarRecurrenceUntil)] = "until {date}",
            [nameof(CalendarRecurrenceExcept)] = "[one]except {count} date[other]except {count} dates",
        }) defaults.Add(entry.Key, entry.Value);
    }
}
