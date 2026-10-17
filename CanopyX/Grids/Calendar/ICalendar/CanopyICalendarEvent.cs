using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX;

/// <summary>An event read from iCalendar text by <see cref="CanopyICalendar.Parse"/>. Its text is plain text: show it as text, never as markup.</summary>
public sealed class CanopyICalendarEvent {
    internal CanopyICalendarEvent(string? uid, string? summary, string? description, string? location, DateTime start, DateTime? end, bool allDay,
        string? timeZone, string? recurrence, string? exceptions, DateTime? recurrenceId, bool recurrenceIdIsDate, string? status, IList<string> categories) {
        Uid = uid;
        Summary = summary;
        Description = description;
        Location = location;
        Start = start;
        End = end;
        AllDay = allDay;
        TimeZone = timeZone;
        Recurrence = recurrence;
        Exceptions = exceptions;
        RecurrenceId = recurrenceId;
        RecurrenceIdIsDate = recurrenceIdIsDate;
        Status = status;
        Categories = new ReadOnlyCollection<string>(new List<string>(categories));
    }

    /// <summary>Gets the event's <c>UID</c> (at most 1,000 characters), or null.</summary>
    public string? Uid { get; }

    /// <summary>Gets the <c>SUMMARY</c>, the event's title, or null.</summary>
    public string? Summary { get; }

    /// <summary>Gets the <c>DESCRIPTION</c>, or null.</summary>
    public string? Description { get; }

    /// <summary>Gets the <c>LOCATION</c>, or null.</summary>
    public string? Location { get; }

    /// <summary>Gets when the event starts, in UTC; for an all-day event the UTC midnight of its date.</summary>
    public DateTime Start { get; }

    /// <summary>Gets when the event ends, in UTC (from <c>DTEND</c> or <c>DURATION</c>), or null for a moment; for an all-day event the exclusive UTC midnight of the day after it.</summary>
    public DateTime? End { get; }

    /// <summary>Gets whether the event lasts whole days (a <c>DATE</c> start).</summary>
    public bool AllDay { get; }

    /// <summary>Gets the <c>TZID</c> of the start when a system time zone has that name, or null (UTC, floating or all-day times).</summary>
    public string? TimeZone { get; }

    /// <summary>Gets the repeat rule as <see cref="CanopyRecurrence"/> rule text, or null for a single event (also when the rule is outside the supported subset).</summary>
    public string? Recurrence { get; }

    /// <summary>Gets the <c>EXDATE</c> values of a repeating event in the calendar's exceptions grammar (UTC instants or <c>yyyy-MM-dd</c> dates, comma-separated), or null.</summary>
    public string? Exceptions { get; }

    /// <summary>Gets the <c>RECURRENCE-ID</c> of an event that replaces one occurrence of a series (the series has the same <see cref="Uid"/>), in UTC, or null.</summary>
    public DateTime? RecurrenceId { get; }

    /// <summary>Gets whether <see cref="RecurrenceId"/> is a date.</summary>
    public bool RecurrenceIdIsDate { get; }

    /// <summary>Gets the <c>STATUS</c> in upper case (<c>TENTATIVE</c>, <c>CONFIRMED</c>, <c>CANCELLED</c>), or null.</summary>
    public string? Status { get; }

    /// <summary>Gets the <c>CATEGORIES</c>, in order.</summary>
    public IReadOnlyList<string> Categories { get; }
}
