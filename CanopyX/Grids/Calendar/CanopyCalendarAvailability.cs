using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The business hours of one resource of a <see cref="CanopyCalendar"/>, or of every resource: time outside them is shaded in its lane.</summary>
public sealed class CanopyCalendarAvailability {
    private TimeSpan _start;
    private TimeSpan _end;
    private string? _resource;

    /// <summary>Creates business hours, Monday to Friday, for every resource.</summary>
    /// <param name="start">When the hours start, 00:00 to 23:59 in whole minutes.</param>
    /// <param name="end">When they end, up to 24:00 in whole minutes, after <paramref name="start"/>.</param>
    /// <exception cref="ArgumentOutOfRangeException">A time is not whole minutes of the day.</exception>
    public CanopyCalendarAvailability(TimeSpan start, TimeSpan end) {
        Start = start;
        End = end;
    }

    /// <summary>Gets or sets the resource id (a node id of the resource tree) the hours belong to; null for every resource.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? Resource {
        get => _resource;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _resource = value; }
    }

    /// <summary>Gets or sets when the hours start, 00:00 to 23:59 in whole minutes.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 23:59.</exception>
    public TimeSpan Start {
        get => _start;
        set => _start = CanopyCalendarValues.Time(value, nameof(value), endOfDay: false)!.Value;
    }

    /// <summary>Gets or sets when the hours end, up to 24:00 in whole minutes; it must be after <see cref="Start"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 24:00.</exception>
    public TimeSpan End {
        get => _end;
        set => _end = CanopyCalendarValues.Time(value, nameof(value), endOfDay: true)!.Value;
    }

    /// <summary>Gets the weekdays the hours apply on, 1 to 7 distinct days. Defaults to Monday to Friday.</summary>
    public IList<DayOfWeek> Days { get; } = new List<DayOfWeek>(CanopyCalendarValues.WorkDays);

    internal void Validate() {
        if (_end <= _start) throw new InvalidOperationException("Business hours end after they start.");
        CanopyCalendarValues.Days(Days, 1, 7, "Business hours");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("resource", _resource);
        if (!CanopyCalendarValues.IsWorkWeek(Days)) CanopyCalendarValues.WriteDays(writer, "days", Days);
        writer.Property("start", CanopyCalendarValues.Format(_start)).Property("end", CanopyCalendarValues.Format(_end)).EndObject();
    }
}
