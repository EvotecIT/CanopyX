using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;

namespace CanopyX;

/// <summary>What <see cref="CanopyICalendar.Parse"/> read: the events, how many it skipped, and notes about what it read differently.</summary>
public sealed class CanopyICalendarResult {
    internal CanopyICalendarResult(IList<CanopyICalendarEvent> events, int skipped, IList<string> notes) {
        Events = new ReadOnlyCollection<CanopyICalendarEvent>(new List<CanopyICalendarEvent>(events));
        Skipped = skipped;
        Notes = new ReadOnlyCollection<string>(new List<string>(notes));
        foreach (var item in Events) {
            if (item.Recurrence != null && item.TimeZone != null && IsIanaName(item.TimeZone)) { TimeZone = item.TimeZone; break; }
        }
    }

    /// <summary>
    /// Gets the IANA time zone of the first repeating event whose start names one (for example <c>Europe/Warsaw</c>), or null. Set it as
    /// the calendar's <see cref="CanopyCalendar.TimeZone"/>: series repeat in that zone, so their occurrences keep their wall time
    /// across daylight saving changes and match the exceptions and moved occurrences, which are read as UTC instants.
    /// </summary>
    public string? TimeZone { get; }

    /// <summary>Whether a zone name is shaped like an IANA name the calendar accepts: <c>Area/Location</c> or <c>UTC</c>.</summary>
    private static bool IsIanaName(string name) {
        if (name.Length == 0 || name.Length > 64 || !(name[0] >= 'A' && name[0] <= 'Z' || name[0] >= 'a' && name[0] <= 'z') || name.EndsWith("/", StringComparison.Ordinal)) return false;
        var previous = '/';
        foreach (var character in name) {
            var allowed = character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '_' || character == '-' || character == '+' || character == '/';
            if (!allowed || character == '/' && previous == '/') return false;
            previous = character;
        }
        return true;
    }

    /// <summary>Gets the events, in the order of the text.</summary>
    public IReadOnlyList<CanopyICalendarEvent> Events { get; }

    /// <summary>Gets how many events were skipped because they were malformed or had no readable start.</summary>
    public int Skipped { get; }

    /// <summary>Gets notes about events read differently (an unknown time zone read as UTC, a repeat rule outside the supported
    /// subset), at most 100; they name events by their position and never repeat the text.</summary>
    public IReadOnlyList<string> Notes { get; }

    /// <summary>
    /// Converts the events for a basic calendar (<see cref="CanopyCalendar(IEnumerable{CanopyCalendarEvent}, CanopyCalendarPreset)"/>).
    /// </summary>
    /// <param name="source">The source id to give every event (one of the calendar's <see cref="CanopyCalendar.Sources"/>), or null.</param>
    /// <returns>The events: the title from <c>SUMMARY</c>, the description from <c>DESCRIPTION</c> with the <c>LOCATION</c> on a
    /// line of its own, the times, and the repeat rule with its exceptions. An event replacing one occurrence of a series (with a
    /// <c>RECURRENCE-ID</c>) becomes an exception of the series and an event of its own; cancelled events are left out.</returns>
    /// <exception cref="ArgumentException"><paramref name="source"/> is empty.</exception>
    public IList<CanopyCalendarEvent> ToCalendarEvents(string? source = null) {
        CanopyIdentifiers.Require(source, nameof(source), allowNull: true);
        // Overrides add their original occurrence to the exceptions of the series with the same UID.
        var masters = new Dictionary<string, CanopyICalendarEvent>(StringComparer.Ordinal);
        foreach (var item in Events) if (item.Uid != null && item.Recurrence != null && !item.RecurrenceId.HasValue && !masters.ContainsKey(item.Uid)) masters[item.Uid] = item;
        var exceptions = new Dictionary<CanopyICalendarEvent, List<string>>();
        foreach (var item in Events) {
            if (!item.RecurrenceId.HasValue || item.Uid == null || !masters.TryGetValue(item.Uid, out var master)) continue;
            if (!exceptions.TryGetValue(master, out var list)) {
                list = new List<string>();
                if (master.Exceptions != null) list.AddRange(master.Exceptions.Split(','));
                exceptions[master] = list;
            }
            if (list.Count >= CanopyICalendar.MaxExceptions) continue;
            var original = item.RecurrenceId.Value;
            list.Add(item.RecurrenceIdIsDate || master.AllDay
                ? original.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                : original.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
        }
        var result = new List<CanopyCalendarEvent>();
        foreach (var item in Events) {
            if (item.Status == "CANCELLED") continue;
            var description = item.Description;
            if (!string.IsNullOrEmpty(item.Location)) description = string.IsNullOrEmpty(description) ? item.Location : description + "\n" + item.Location;
            var created = new CanopyCalendarEvent(item.Summary ?? string.Empty, item.Start) {
                End = item.End, AllDay = item.AllDay, Description = string.IsNullOrEmpty(description) ? null : description, Source = source
            };
            if (item.Recurrence != null && !item.RecurrenceId.HasValue) {
                created.Recurrence = CanopyRecurrence.Parse(item.Recurrence);
                created.Exceptions = exceptions.TryGetValue(item, out var list) ? string.Join(",", list) : item.Exceptions;
            }
            result.Add(created);
        }
        return result;
    }
}
