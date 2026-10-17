using System;
using System.Collections.Generic;

namespace CanopyX;

// The calendar's chrome, details, sources, creation and view settings.
public sealed partial class CanopyCalendar {
    private string? _description, _tone, _source;
    private int _months = 6;
    private DateTime? _validStart, _validEnd;

    /// <summary>Gets or sets the text column of each event's description, shown in the details popover and the hover card; null for none.</summary>
    public string? Description { get => _description; set => _description = Column(value); }

    /// <summary>
    /// Gets or sets the text column of each record's tone name (<c>neutral</c>, <c>info</c>, <c>success</c>, <c>warning</c>,
    /// <c>danger</c>, <c>muted</c> or a tone the host's theme defines), which wins over the status tone; null for none.
    /// </summary>
    public string? Tone { get => _tone; set => _tone = Column(value); }

    /// <summary>Gets or sets the text column of each record's source id, one of <see cref="Sources"/>; null for none.</summary>
    public string? Source { get => _source; set => _source = Column(value); }

    /// <summary>
    /// Gets the event sources, 1 to 50 with unique ids when any are given, shown as a legend that switches each one off. They need
    /// the <see cref="Source"/> column unless every source has an <see cref="CanopyCalendarSource.Ics"/> file.
    /// </summary>
    public IList<CanopyCalendarSource> Sources { get; } = new List<CanopyCalendarSource>();

    /// <summary>
    /// Gets or sets whether grid toolbar controls show above the calendar. Defaults to true, which shows the controls of
    /// <see cref="ToolbarItems"/>, or all of them when that list is empty. False shows the calendar's own bar only: no grid
    /// toolbar, no query line and no pager (and <see cref="ToolbarItems"/> must be empty).
    /// </summary>
    public bool Toolbar { get; set; } = true;

    /// <summary>Gets the only grid toolbar controls shown above the calendar, each once, when <see cref="Toolbar"/> is true; empty shows them all.</summary>
    public IList<CanopyCalendarToolbarItem> ToolbarItems { get; } = new List<CanopyCalendarToolbarItem>();

    /// <summary>Gets or sets what activating an event opens. Defaults to <see cref="CanopyCalendarDetails.Drawer"/>.</summary>
    public CanopyCalendarDetails Details { get; set; }

    /// <summary>Gets or sets how readers create events by clicking or dragging over empty time and from the keyboard; null (the default) for no creation. The start and title columns must be editable.</summary>
    public CanopyCalendarCreate? Create { get; set; }

    /// <summary>
    /// Gets or sets whether the calendar accepts external drops: elements marked <c>data-canopyx-event</c> and rows dragged from a
    /// CanopyX grid, which become new records. Defaults to false. The start and title columns must be editable.
    /// </summary>
    public bool Drop { get; set; }

    /// <summary>
    /// Gets or sets what moving or resizing an occurrence of a series changes; null (the default) asks when <see cref="Series"/> and
    /// <see cref="RecurrenceId"/> are set and their columns are editable, and changes every occurrence otherwise. Every setting but
    /// <see cref="CanopyCalendarOccurrence.All"/> needs <see cref="Series"/> and <see cref="RecurrenceId"/> with editable columns.
    /// </summary>
    public CanopyCalendarOccurrence? Occurrence { get; set; }

    /// <summary>Gets or sets the week numbers of the month, week and stacked months views. Defaults to <see cref="CanopyCalendarWeekNumbers.None"/>.</summary>
    public CanopyCalendarWeekNumbers WeekNumbers { get; set; }

    /// <summary>Gets or sets whether day names and numbers open that day, when the day view is offered. Defaults to true.</summary>
    public bool NavLinks { get; set; } = true;

    /// <summary>Gets or sets the first date (inclusive, its date part only) navigation, selection, creation and drops may reach; null for no bound.</summary>
    public DateTime? ValidStart {
        get => _validStart;
        set => _validStart = value?.Date;
    }

    /// <summary>Gets or sets the date (exclusive, its date part only) navigation, selection, creation and drops stay before, after <see cref="ValidStart"/>; null for no bound.</summary>
    public DateTime? ValidEnd {
        get => _validEnd;
        set => _validEnd = value?.Date;
    }

    /// <summary>Gets or sets whether the month view always shows six weeks. Defaults to false.</summary>
    public bool FixedWeeks { get; set; }

    /// <summary>Gets or sets whether the month view shows the days of the months around it. Defaults to true.</summary>
    public bool OutsideDays { get; set; } = true;

    /// <summary>Gets or sets the timeline's period instead of its zoom's default (for example two weeks at day zoom); null for the default.</summary>
    public CanopyCalendarSpan? Span { get; set; }

    /// <summary>Gets or sets whether events, slots, days and resources have context menus (Shift+F10, the context-menu key, right-click or a long press). Defaults to true.</summary>
    public bool Menu { get; set; } = true;

    /// <summary>Gets or sets whether pointing at an event shows a card with its details after a short delay, on pointer devices. Defaults to true.</summary>
    public bool Hover { get; set; } = true;

    /// <summary>Gets or sets whether the year view lists each day's events (dots with titles) instead of shading busy days only. Defaults to false.</summary>
    public bool YearEvents { get; set; }

    /// <summary>Gets or sets the period of the agenda. Defaults to <see cref="CanopyCalendarAgendaSpan.Month"/>.</summary>
    public CanopyCalendarAgendaSpan AgendaSpan { get; set; } = CanopyCalendarAgendaSpan.Month;

    /// <summary>Gets or sets how many months the stacked months view shows, 2 to 24. Defaults to 6.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 2 to 24.</exception>
    public int Months {
        get => _months;
        set => _months = value < 2 || value > 24 ? throw new ArgumentOutOfRangeException(nameof(value), value, "The stacked months view shows 2 to 24 months.") : value;
    }

    /// <summary>Gets or sets whether the calendar's bar has a Print button that prints the current view. Defaults to false.</summary>
    public bool Print { get; set; }
}
