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
        }) defaults.Add(entry.Key, entry.Value);
    }
}
