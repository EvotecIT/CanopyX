using System;

namespace CanopyX;

/// <summary>
/// An event of a basic calendar (<see cref="CanopyCalendar(System.Collections.Generic.IEnumerable{CanopyCalendarEvent}, CanopyCalendarPreset)"/>),
/// which needs no grid of its own: the calendar writes one row per event.
/// </summary>
public sealed class CanopyCalendarEvent {
    private string? _id, _resource, _source;
    private string _title;
    private DateTime _start, _startDate;
    private DateTime? _end, _endDate;

    /// <summary>Creates an event.</summary>
    /// <param name="title">What the event is.</param>
    /// <param name="start">When it starts. A local time is converted to UTC; an unspecified one is taken as UTC.</param>
    /// <exception cref="ArgumentNullException"><paramref name="title"/> is null.</exception>
    public CanopyCalendarEvent(string title, DateTime start) {
        _title = title ?? throw new ArgumentNullException(nameof(title));
        Start = start;
    }

    /// <summary>Creates an event.</summary>
    /// <param name="title">What the event is.</param>
    /// <param name="start">When it starts; for an <see cref="AllDay"/> event its own date (before conversion to UTC) counts.</param>
    /// <exception cref="ArgumentNullException"><paramref name="title"/> is null.</exception>
    public CanopyCalendarEvent(string title, DateTimeOffset start) : this(title, start, null) {
    }

    /// <summary>Creates an event with an end.</summary>
    /// <param name="title">What the event is.</param>
    /// <param name="start">When it starts; for an <see cref="AllDay"/> event its own date (before conversion to UTC) counts.</param>
    /// <param name="end">When it ends, or null; for an <see cref="AllDay"/> event its own date counts, exclusive.</param>
    /// <exception cref="ArgumentNullException"><paramref name="title"/> is null.</exception>
    public CanopyCalendarEvent(string title, DateTimeOffset start, DateTimeOffset? end) {
        _title = title ?? throw new ArgumentNullException(nameof(title));
        _start = start.UtcDateTime;
        _startDate = start.Date;
        _end = end?.UtcDateTime;
        _endDate = end?.Date;
    }

    /// <summary>Gets or sets the event's row id, unique within the calendar; null numbers the event <c>e1</c>, <c>e2</c>, ... in input order.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? Id {
        get => _id;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _id = value; }
    }

    /// <summary>Gets or sets what the event is.</summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public string Title {
        get => _title;
        set => _title = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>
    /// Gets or sets when the event starts. A local time is converted to UTC when written; an unspecified one is taken as UTC. For an
    /// <see cref="AllDay"/> event only the date counts, as given (a local date stays that date).
    /// </summary>
    public DateTime Start {
        get => _start;
        set { _start = value; _startDate = value.Date; }
    }

    /// <summary>
    /// Gets or sets when the event ends; null makes a zero-length marker, or a one-day event when <see cref="AllDay"/>. For an
    /// all-day event only the date counts, and it is exclusive: an event on the 16th alone ends on the 17th.
    /// </summary>
    public DateTime? End {
        get => _end;
        set { _end = value; _endDate = value?.Date; }
    }

    /// <summary>Gets or sets whether the event lasts whole days (UTC dates with an exclusive end). Defaults to false.</summary>
    public bool AllDay { get; set; }

    /// <summary>Gets or sets the description shown in the details popover, the hover card and the drawer; null for none.</summary>
    public string? Description { get; set; }

    /// <summary>Gets or sets the event's tone; <see cref="CanopyTone.None"/> (the default) uses the calendar's.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets the event's resource id, a node id of the calendar's resources; null for none.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? Resource {
        get => _resource;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _resource = value; }
    }

    /// <summary>Gets or sets the rule the event repeats by; null for a single event.</summary>
    public CanopyRecurrence? Recurrence { get; set; }

    /// <summary>Gets or sets the excluded occurrences of a repeating event: ISO date-times or <c>yyyy-MM-dd</c> dates separated by commas, semicolons or white space, at most 1000; null for none.</summary>
    public string? Exceptions { get; set; }

    /// <summary>Gets or sets the id of the event's source, one of <see cref="CanopyCalendar.Sources"/>; null for none.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? Source {
        get => _source;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _source = value; }
    }

    /// <summary>The start cell: the UTC moment, or the UTC midnight of the date of an all-day event.</summary>
    internal DateTime StartCell => AllDay ? DateTime.SpecifyKind(_startDate, DateTimeKind.Utc) : CanopyCalendarValues.Utc(_start);

    /// <summary>The end cell: the UTC moment, or the exclusive UTC midnight of an all-day event (one day without an end); null for none.</summary>
    internal DateTime? EndCell {
        get {
            if (!AllDay) return _end.HasValue ? CanopyCalendarValues.Utc(_end.Value) : null;
            var start = StartCell;
            var end = _endDate.HasValue ? DateTime.SpecifyKind(_endDate.Value, DateTimeKind.Utc) : start;
            return end > start ? end : start.AddDays(1);
        }
    }
}
