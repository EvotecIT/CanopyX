using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The working hours of a <see cref="CanopyCalendar"/>: the time slots outside them are shaded.</summary>
public sealed class CanopyCalendarHours {
    private TimeSpan _start;
    private TimeSpan _end;

    /// <summary>Creates working hours, Monday to Friday.</summary>
    /// <param name="start">When work starts, 00:00 to 23:59 in whole minutes.</param>
    /// <param name="end">When work ends, 00:01 to 24:00 in whole minutes, after <paramref name="start"/>.</param>
    /// <exception cref="ArgumentOutOfRangeException">A time is not whole minutes of the day.</exception>
    public CanopyCalendarHours(TimeSpan start, TimeSpan end) {
        Start = start;
        End = end;
    }

    /// <summary>Gets or sets when work starts, 00:00 to 23:59 in whole minutes.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 23:59.</exception>
    public TimeSpan Start {
        get => _start;
        set => _start = CanopyCalendarValues.Time(value, nameof(value), endOfDay: false)!.Value;
    }

    /// <summary>Gets or sets when work ends, up to 24:00 in whole minutes; it must be after <see cref="Start"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 24:00.</exception>
    public TimeSpan End {
        get => _end;
        set => _end = CanopyCalendarValues.Time(value, nameof(value), endOfDay: true)!.Value;
    }

    /// <summary>Gets the working weekdays, 1 to 7 distinct days. Defaults to Monday to Friday.</summary>
    public IList<DayOfWeek> Days { get; } = new List<DayOfWeek>(CanopyCalendarValues.WorkDays);

    internal void Validate() {
        if (_end <= _start) throw new InvalidOperationException("Working hours end after they start.");
        CanopyCalendarValues.Days(Days, 1, 7, "Working hours");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (!CanopyCalendarValues.IsWorkWeek(Days)) CanopyCalendarValues.WriteDays(writer, "days", Days);
        writer.Property("start", CanopyCalendarValues.Format(_start)).Property("end", CanopyCalendarValues.Format(_end)).EndObject();
    }
}
