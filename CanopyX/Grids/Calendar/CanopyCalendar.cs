using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A calendar of a flat grid's records: each record is an event that starts at its <see cref="Start"/> cell, shown in month, week,
/// day, N-day, agenda, year, mini month, list and stacked months views, or as a timeline. The grid's search, filters and saved views apply to it.
/// </summary>
/// <remarks>
/// <para>Set it on <see cref="CanopyDataGridView.Calendar"/>. Every setting names columns of the same grid by id; only the start
/// is required. A record with a <see cref="Recurrence"/> rule repeats (<see cref="CanopyRecurrence"/> writes and expands the rule
/// text), <see cref="Exceptions"/> removes occurrences, and override records (<see cref="Series"/> with
/// <see cref="RecurrenceId"/>) replace single occurrences. A hosted grid's calendar asks its source for the records of the
/// visible range only.</para>
/// <para>Settings left at their defaults are not written. <see cref="CanopyDataGridView.Validate"/> checks the columns and their
/// kinds, the bounds and the combinations the browser checks, and throws <see cref="InvalidOperationException"/>.</para>
/// </remarks>
public sealed partial class CanopyCalendar {
    private string _start;
    private string? _end, _title, _subtitle, _allDay, _resource, _status, _recurrence, _exceptions, _series, _recurrenceId, _display, _seriesEnd;
    private int _days = 3;
    private int _slotMinutes = 30;
    private TimeSpan? _minTime, _maxTime, _scrollTime;
    private int? _eventLimit;
    private int? _limit;
    private string? _timeZone;
    private DateTime? _date;
    private CanopyCalendarResources? _resources;
    private string? _resourceIds;

    /// <summary>Creates a calendar of the grid's records.</summary>
    /// <param name="start">The id of the date-and-time column that holds each event's start.</param>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public CanopyCalendar(string start) {
        CanopyIdentifiers.Require(start, nameof(start));
        _start = start;
    }

    /// <summary>A calendar whose start column a typed builder sets later.</summary>
    internal CanopyCalendar() {
        _start = string.Empty;
    }

    /// <summary>Gets or sets the id of the date-and-time column that holds each event's start.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string Start {
        get => _start;
        set { CanopyIdentifiers.Require(value, nameof(value)); _start = value; }
    }

    /// <summary>Gets or sets the date-and-time column of each event's end; null, an empty cell or an end before the start makes a zero-length marker.</summary>
    public string? End { get => _end; set => _end = Column(value); }

    /// <summary>Gets or sets the column of each event's title, of any kind; null uses the row header column, or else the first visible column.</summary>
    public string? Title { get => _title; set => _title = Column(value); }

    /// <summary>Gets or sets the column of a second line under the title, of any kind; null for none.</summary>
    public string? Subtitle { get => _subtitle; set => _subtitle = Column(value); }

    /// <summary>Gets or sets the text column of booleans that mark all-day events, whose dates are read as UTC dates with an exclusive midnight end.</summary>
    public string? AllDay { get => _allDay; set => _allDay = Column(value); }

    /// <summary>Gets or sets the text column of each event's resource id, a node id of <see cref="Resources"/>.</summary>
    public string? Resource { get => _resource; set => _resource = Column(value); }

    /// <summary>Gets or sets a text column containing a JSON array of resource ids. Each event appears in every assigned resource with one event identity.</summary>
    public string? ResourceIds { get => _resourceIds; set => _resourceIds = Column(value); }

    /// <summary>Gets or sets the column of each event's status, of any kind, shown with the column's presenter; its tone colours the event.</summary>
    public string? Status { get => _status; set => _status = Column(value); }

    /// <summary>
    /// Gets or sets the text column of each event's recurrence rule (<see cref="CanopyRecurrence"/> rule text, with or without <c>RRULE:</c>).
    /// Series expand in one fixed zone for every reader: <see cref="TimeZone"/> when it names an IANA zone, otherwise UTC (all-day
    /// series always in UTC). Give recurring data the IANA zone it was planned in, and pass the same zone to
    /// <see cref="CanopyRecurrence.Occurrences(DateTimeOffset, TimeZoneInfo, DateTimeOffset?, DateTimeOffset?, string?)"/> and
    /// <see cref="CanopyRecurrence.SeriesEnd(DateTimeOffset, TimeSpan, TimeZoneInfo, string?)"/> on the server.
    /// </summary>
    public string? Recurrence { get => _recurrence; set => _recurrence = Column(value); }

    /// <summary>Gets or sets the text column of each series' excluded occurrences: ISO date-times (without an offset, a wall time in the series' zone) or <c>yyyy-MM-dd</c> dates, separated by commas, semicolons or white space, at most 1000.</summary>
    public string? Exceptions { get => _exceptions; set => _exceptions = Column(value); }

    /// <summary>Gets or sets the text column of an override record's series: the id of the series row whose occurrence it replaces. Set with <see cref="RecurrenceId"/>.</summary>
    public string? Series { get => _series; set => _series = Column(value); }

    /// <summary>Gets or sets the date-and-time column of an override record's original occurrence start. Set with <see cref="Series"/>.</summary>
    public string? RecurrenceId { get => _recurrenceId; set => _recurrenceId = Column(value); }

    /// <summary>Gets or sets a text column whose value <c>background</c> draws the record as a background range instead of an event.</summary>
    public string? Display { get => _display; set => _display = Column(value); }

    /// <summary>Gets or sets the date-and-time column of the end of each series' last occurrence (empty for endless series), which lets a server find series in a range; <see cref="CanopyRecurrence.SeriesEnd(DateTime, TimeSpan, TimeZoneInfo, string?)"/> fills it.</summary>
    public string? SeriesEnd { get => _seriesEnd; set => _seriesEnd = Column(value); }

    /// <summary>Gets or sets the view the calendar opens in; null (the default) opens the first of <see cref="Views"/>, which is the month view by default.</summary>
    public CanopyCalendarView? View { get; set; }

    /// <summary>Gets the views offered, in this order, each once; empty offers month, week, day and agenda, plus the timeline when <see cref="Resources"/> is set.</summary>
    public IList<CanopyCalendarView> Views { get; } = new List<CanopyCalendarView>();

    /// <summary>Gets or sets the first date shown (its date part only); null shows today in the display time zone.</summary>
    public DateTime? Date {
        get => _date;
        set => _date = value?.Date;
    }

    /// <summary>Gets or sets the length of the N-day view, 2 to 14 days. Defaults to 3.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 2 to 14.</exception>
    public int Days {
        get => _days;
        set => _days = value < 2 || value > 14 ? throw new ArgumentOutOfRangeException(nameof(value), value, "The N-day view shows 2 to 14 days.") : value;
    }

    /// <summary>Gets or sets the first day of the week; null uses the page language's.</summary>
    public DayOfWeek? FirstDay { get; set; }

    /// <summary>Gets the weekdays left out of the views (for example Saturday and Sunday), at most 6, each once.</summary>
    public IList<DayOfWeek> HiddenDays { get; } = new List<DayOfWeek>();

    /// <summary>Gets or sets the time slot size of the week and day views in minutes: 5, 10, 15, 20, 30 or 60. Defaults to 30.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not one of the supported sizes.</exception>
    public int SlotMinutes {
        get => _slotMinutes;
        set => _slotMinutes = Array.IndexOf(SlotSizes, value) < 0 ? throw new ArgumentOutOfRangeException(nameof(value), value, "Time slots are 5, 10, 15, 20, 30 or 60 minutes.") : value;
    }

    /// <summary>Gets or sets the first visible hour of the week and day views, on a slot boundary; null keeps 00:00.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 23:59.</exception>
    public TimeSpan? MinTime { get => _minTime; set => _minTime = CanopyCalendarValues.Time(value, nameof(value), endOfDay: false); }

    /// <summary>Gets or sets the end of the visible hours, on a slot boundary and after <see cref="MinTime"/>; null keeps 24:00.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 24:00.</exception>
    public TimeSpan? MaxTime { get => _maxTime; set => _maxTime = CanopyCalendarValues.Time(value, nameof(value), endOfDay: true); }

    /// <summary>Gets or sets the hour scrolled into view first; null keeps 08:00.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The time is not whole minutes from 00:00 to 23:59.</exception>
    public TimeSpan? ScrollTime { get => _scrollTime; set => _scrollTime = CanopyCalendarValues.Time(value, nameof(value), endOfDay: false); }

    /// <summary>Gets or sets the working hours; the time slots outside them are shaded. Null for none.</summary>
    public CanopyCalendarHours? WorkingHours { get; set; }

    /// <summary>Gets or sets whether a line marks the current time. Defaults to true.</summary>
    public bool NowIndicator { get; set; } = true;

    /// <summary>Gets or sets how many events a month cell shows before "+N more", 1 to 20; null fits as many as the cell holds.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 20.</exception>
    public int? EventLimit {
        get => _eventLimit;
        set => _eventLimit = value < 1 || value > 20 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A month cell shows 1 to 20 events first.") : value;
    }

    /// <summary>Gets or sets how events are drawn. Defaults to <see cref="CanopyCalendarEventStyle.Quiet"/>.</summary>
    public CanopyCalendarEventStyle EventStyle { get; set; }

    /// <summary>Gets or sets the display time zone: <c>utc</c>, <c>local</c> or an IANA zone name such as <c>Europe/Warsaw</c>; null uses the grid's <see cref="CanopyDataGridView.TimeZone"/>. An IANA zone is also the zone recurring events expand in (see <see cref="Recurrence"/>).</summary>
    /// <exception cref="ArgumentException">The value is not <c>utc</c>, <c>local</c> or an IANA zone name.</exception>
    public string? TimeZone {
        get => _timeZone;
        set => _timeZone = value != null && !IsTimeZone(value) ? throw new ArgumentException("A calendar time zone is utc, local or an IANA zone name such as Europe/Warsaw.", nameof(value)) : value;
    }

    /// <summary>Gets or sets how events are moved and resized; null (the default) keeps the calendar read-only.</summary>
    public CanopyCalendarEditing? Editing { get; set; }

    /// <summary>
    /// Gets or sets the resources of the timeline and the resource columns; null for none. Set after a preset
    /// (<see cref="ApplyPreset"/>), they complete it: the basic preset keeps the timeline out of empty <see cref="Views"/>, and
    /// the scheduler adds its concurrency lane when <see cref="Capacity"/> is null.
    /// </summary>
    public CanopyCalendarResources? Resources {
        get => _resources;
        set { _resources = value; if (value != null) CompletePreset(); }
    }

    /// <summary>Gets or sets the timeline's zoom level. Defaults to <see cref="CanopyCalendarZoom.Day"/>, or to the first of <see cref="Zooms"/> when they leave Day out.</summary>
    public CanopyCalendarZoom Zoom { get; set; } = CanopyCalendarZoom.Day;

    /// <summary>Gets the timeline zoom levels offered, in this order, each once; empty offers all five.</summary>
    public IList<CanopyCalendarZoom> Zooms { get; } = new List<CanopyCalendarZoom>();

    /// <summary>Gets or sets a concurrency lane under each resource group of the timeline; null for none.</summary>
    public CanopyCalendarCapacity? Capacity { get; set; }

    /// <summary>Gets the static background ranges (holidays, freezes, maintenance windows), at most 1,000.</summary>
    public IList<CanopyCalendarRange> Ranges { get; } = new List<CanopyCalendarRange>();

    /// <summary>Gets the business hours per resource, at most 10,000; time outside them is shaded in the timeline lanes.</summary>
    public IList<CanopyCalendarAvailability> Availability { get; } = new List<CanopyCalendarAvailability>();

    /// <summary>Gets or sets the most occurrences one visible range shows, 1 to 100,000; null keeps 20,000. More shows a "showing the first" notice.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 100,000.</exception>
    public int? Limit {
        get => _limit;
        set => _limit = value < 1 || value > 100000 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A range shows 1 to 100,000 occurrences.") : value;
    }

    /// <summary>Gets or sets the view phones (640 pixels wide or less) open in, one of <see cref="Views"/>; null uses the agenda when it is offered.</summary>
    public CanopyCalendarView? PhoneView { get; set; }

    private static readonly int[] SlotSizes = { 5, 10, 15, 20, 30, 60 };

    private static string? Column(string? id) {
        CanopyIdentifiers.Require(id, "value", allowNull: true);
        return id;
    }

    /// <summary>Whether a value is <c>utc</c>, <c>local</c>, or shaped like an IANA zone name (<c>Area/Location</c>, <c>UTC</c>).</summary>
    private static bool IsTimeZone(string value) {
        if (value == "utc" || value == "local") return true;
        if (value.Length == 0 || value.Length > 64 || !char.IsLetter(value[0]) || value[0] > 'z') return false;
        var previous = '/';
        foreach (var character in value) {
            var allowed = character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '_' || character == '-' || character == '+' || character == '/';
            if (!allowed || character == '/' && previous == '/') return false;
            previous = character;
        }
        return previous != '/';
    }
}
