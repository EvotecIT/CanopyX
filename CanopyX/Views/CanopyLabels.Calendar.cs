namespace CanopyX;

// The labels of a grid's calendar (CanopyCalendar); the calendar part carries their English texts.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the button that shows the period of today. Default "Today".</summary>
    public string CalendarToday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the button that shows the previous period. Default "Previous period".</summary>
    public string CalendarPrevious { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the button that shows the next period. Default "Next period".</summary>
    public string CalendarNext { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the view switch. Default "Calendar view".</summary>
    public string CalendarViews { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the month view's name. Default "Month".</summary>
    public string CalendarMonth { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the week view's name. Default "Week".</summary>
    public string CalendarWeek { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the day view's name. Default "Day".</summary>
    public string CalendarDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the N-day view's name, including <c>{count}</c>. Default "{count} days".</summary>
    public string CalendarDays { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the agenda view's name. Default "Agenda".</summary>
    public string CalendarAgenda { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the year view's name. Default "Year".</summary>
    public string CalendarYear { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the resource timeline's name. Default "Timeline".</summary>
    public string CalendarTimeline { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the date picker that jumps to a date. Default "Go to date".</summary>
    public string CalendarGoTo { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of the all-day row and of all-day events. Default "All day".</summary>
    public string CalendarAllDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the link under a full month cell, including <c>{count}</c>. Default "+{count} more".</summary>
    public string CalendarMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of that link, including <c>{count}</c> and <c>{date}</c>. Default "Show {count} more events on {date}".</summary>
    public string CalendarMoreLabel { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the heading of the popover that lists a day's events, including <c>{date}</c>. Default "Events on {date}".</summary>
    public string CalendarDayEvents { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the empty state of a period without events. Default "No events in this period".</summary>
    public string CalendarNoEvents { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the number of events a screen reader hears for a day or period, including <c>{count}</c>, with plural forms. Default "[one]{count} event[other]{count} events".</summary>
    public string CalendarEvents { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after the view or period changes, including <c>{view}</c> and <c>{range}</c>. Default "{view}, {range}".</summary>
    public string CalendarShowing { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the marker of a recurring event. Default "Repeats".</summary>
    public string CalendarRepeats { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the notice when a period holds more occurrences than the calendar's limit, including <c>{count}</c>. Default "Showing the first {count} events. Narrow the period or the filters to see the rest.".</summary>
    public string CalendarTruncated { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the notice while a hosted calendar loads a period. Default "Loading events…".</summary>
    public string CalendarLoading { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the notice when a period could not be loaded, including <c>{error}</c>. Default "Could not load events: {error}".</summary>
    public string CalendarLoadError { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the current-time line. Default "Now".</summary>
    public string CalendarNow { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the timeline's zoom switch. Default "Zoom".</summary>
    public string CalendarZoom { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the hour zoom level's name. Default "Hours".</summary>
    public string CalendarZoomHour { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the day zoom level's name. Default "Days".</summary>
    public string CalendarZoomDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the week zoom level's name. Default "Weeks".</summary>
    public string CalendarZoomWeek { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the month zoom level's name. Default "Months".</summary>
    public string CalendarZoomMonth { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the quarter zoom level's name. Default "Quarters".</summary>
    public string CalendarZoomQuarter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the heading of the timeline's resource column when the calendar sets none. Default "Resources".</summary>
    public string CalendarResources { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of a resource group's concurrency lane when the calendar sets none. Default "Concurrent events".</summary>
    public string CalendarCapacity { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip of a concurrency lane segment, including <c>{count}</c>. Default "{count} at once".</summary>
    public string CalendarCapacityAt { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the busy-hours figure of a resource, including <c>{hours}</c>. Default "{hours} h busy".</summary>
    public string CalendarBusy { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the overlap figure of a resource, including <c>{count}</c>, with plural forms. Default "[one]{count} overlap[other]{count} overlaps".</summary>
    public string CalendarOverlaps { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of unavailable time. Default "Unavailable".</summary>
    public string CalendarUnavailable { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when an event is dropped outside working hours. Default "Outside working hours".</summary>
    public string CalendarOutsideHours { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when a moved event overlaps another, including <c>{title}</c>. Default "Overlaps {title}".</summary>
    public string CalendarConflict { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when a resource may not take an event, including <c>{resource}</c>. Default "{resource} cannot take this event".</summary>
    public string CalendarNotAllowed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after an event moved, including <c>{title}</c> and <c>{time}</c>. Default "{title} moved to {time}".</summary>
    public string CalendarMoved { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after an event's end changed, including <c>{title}</c> and <c>{time}</c>. Default "{title} now ends {time}".</summary>
    public string CalendarResized { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after a whole series moved, including <c>{title}</c>. Default "Every occurrence of {title} moved".</summary>
    public string CalendarSeriesMoved { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears, and the move's ghost shows, when a series would change its day. Default "Only the time of a whole series can be moved here.".</summary>
    public string CalendarSeriesTime { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the keyboard help of an event being moved. Default "Arrow keys move, Shift with arrow keys changes the end, Alt with Up or Down changes the resource, Enter saves, Escape cancels.".</summary>
    public string CalendarMoveHelp { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of an editable event, including <c>{title}</c>. Default "Move or resize {title}".</summary>
    public string CalendarEdit { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when a change could not be saved, including <c>{title}</c> and <c>{error}</c>. Default "{title} was not saved: {error}".</summary>
    public string CalendarSaveFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the export menu's iCalendar format. Default "iCalendar (.ics)".</summary>
    public string CalendarExport { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a time range is written, including <c>{start}</c> and <c>{end}</c>. Default "{start} – {end}".</summary>
    public string CalendarTimeRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after a range of slots is selected, including <c>{range}</c>. Default "Selected {range}".</summary>
    public string CalendarSelected { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a timeline lane, including <c>{resource}</c> and <c>{events}</c>. Default "{resource}, {events}".</summary>
    public string CalendarLane { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when search highlights events, including <c>{count}</c>, with plural forms. Default "[one]{count} event highlighted[other]{count} events highlighted".</summary>
    public string CalendarHighlighted { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the small month view. Default "Mini month".</summary>
    public string CalendarMini { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the week list view. Default "Week list".</summary>
    public string CalendarWeekList { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the day list view. Default "Day list".</summary>
    public string CalendarDayList { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the name of the stacked months view. Default "Months".</summary>
    public string CalendarMonths { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a week number, including <c>{number}</c>. Default "Week {number}".</summary>
    public string CalendarWeekNumber { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the short week number shown beside a week, including <c>{number}</c>. Default "W{number}".</summary>
    public string CalendarWeekShort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the heading of the form that creates an event. Default "New event".</summary>
    public string CalendarNewEvent { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the label of a new event's title field. Default "Title".</summary>
    public string CalendarEventTitle { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that adds a new event. Default "Add".</summary>
    public string CalendarCreate { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that closes the new event form without adding it. Default "Cancel".</summary>
    public string CalendarCancel { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after an event was created, including <c>{title}</c> and <c>{time}</c>. Default "{title} added on {time}".</summary>
    public string CalendarCreated { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears after a dropped item became an event, including <c>{title}</c> and <c>{time}</c>. Default "{title} scheduled on {time}".</summary>
    public string CalendarReceived { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the heading of the choice of what moving an occurrence changes. Default "Change a repeating event".</summary>
    public string CalendarOccurrenceTitle { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the choice that changes only the moved occurrence. Default "This event".</summary>
    public string CalendarThisEvent { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when saving part of a series would lose read-only values. Default "This part of the series cannot be saved because some values are read-only.".</summary>
    public string CalendarOccurrenceReadOnly { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the choice that changes the moved occurrence and the ones after it. Default "This and following events".</summary>
    public string CalendarThisAndFollowing { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the choice that changes every occurrence. Default "All events".</summary>
    public string CalendarAllEvents { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the legend of event sources. Default "Calendars".</summary>
    public string CalendarSources { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when an iCalendar file could not be read, including <c>{source}</c> and <c>{error}</c>. Default "Could not read {source}: {error}".</summary>
    public string CalendarImportFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of an event's context menu, including <c>{title}</c>. Default "Actions for {title}".</summary>
    public string CalendarActions { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the context menu item that opens an event. Default "Open".</summary>
    public string CalendarOpen { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the context menu item that starts moving an event. Default "Move".</summary>
    public string CalendarMove { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the context menu item that creates an event at a slot or day. Default "New event here".</summary>
    public string CalendarNewHere { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note when a date is outside the calendar's valid range. Default "Outside the dates this calendar shows".</summary>
    public string CalendarOutsideRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button that closes the details popover. Default "Close".</summary>
    public string CalendarClose { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of an event's details popover, including <c>{title}</c>. Default "Details of {title}".</summary>
    public string CalendarDetailsOf { get => Get(); set => Set(value); }
}
