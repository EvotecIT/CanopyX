  // ---------- calendar: the English texts of its labels ----------
  // The part brings them, as the editing part brings its own: the core accepts calendar… names from views and hosts without
  // defining them, and label packs translate them. Month and weekday names never come from here; Intl writes them.
  const CALENDAR_LABELS = {
    calendarToday: "Today", calendarPrevious: "Previous period", calendarNext: "Next period", calendarViews: "Calendar view",
    calendarMonth: "Month", calendarWeek: "Week", calendarDay: "Day", calendarDays: "{count} days", calendarAgenda: "Agenda", calendarYear: "Year",
    calendarTimeline: "Timeline", calendarGoTo: "Go to date", calendarAllDay: "All day", calendarMore: "+{count} more",
    calendarMoreLabel: "Show {count} more events on {date}", calendarDayEvents: "Events on {date}", calendarNoEvents: "No events in this period",
    calendarEvents: "[one]{count} event[other]{count} events", calendarShowing: "{view}, {range}", calendarRepeats: "Repeats",
    calendarTruncated: "Showing the first {count} events. Narrow the period or the filters to see the rest.", calendarLoading: "Loading events…",
    calendarLoadError: "Could not load events: {error}", calendarNow: "Now", calendarZoom: "Zoom", calendarZoomHour: "Hours", calendarZoomDay: "Days",
    calendarZoomWeek: "Weeks", calendarZoomMonth: "Months", calendarZoomQuarter: "Quarters", calendarResources: "Resources",
    calendarCapacity: "Concurrent events", calendarCapacityAt: "{count} at once", calendarBusy: "{hours} h busy",
    calendarOverlaps: "[one]{count} overlap[other]{count} overlaps", calendarUnavailable: "Unavailable", calendarOutsideHours: "Outside working hours",
    calendarConflict: "Overlaps {title}", calendarNotAllowed: "{resource} cannot take this event", calendarMoved: "{title} moved to {time}",
    calendarResized: "{title} now ends {time}", calendarSeriesMoved: "Every occurrence of {title} moved", calendarSeriesTime: "Only the time of a whole series can be moved here.",
    calendarMoveHelp: "Arrow keys move, Shift with arrow keys changes the end, Alt with Up or Down changes the resource, Enter saves, Escape cancels.",
    calendarEdit: "Move or resize {title}", calendarSaveFailed: "{title} was not saved: {error}", calendarExport: "iCalendar (.ics)",
    calendarTimeRange: "{start} – {end}", calendarSelected: "Selected {range}", calendarLane: "{resource}, {events}",
    calendarHighlighted: "[one]{count} event highlighted[other]{count} events highlighted",
    calendarMini: "Mini month", calendarWeekList: "Week list", calendarDayList: "Day list", calendarMonths: "Months", calendarWeekNumber: "Week {number}",
    calendarWeekShort: "W{number}", calendarNewEvent: "New event", calendarEventTitle: "Title", calendarCreate: "Add", calendarCancel: "Cancel",
    calendarCreated: "{title} added on {time}", calendarReceived: "{title} scheduled on {time}", calendarOccurrenceTitle: "Change a repeating event",
    calendarOccurrenceReadOnly: "This part of the series cannot be saved because some values are read-only.",
    calendarEditOccurrence: "Edit this occurrence", calendarRemoveOccurrence: "Remove this occurrence",
    calendarOccurrenceScope: "Only {date} changes; other dates of {title} stay as they are.",
    calendarSharedResources: "{count} {resources}", calendarResourceWindow: "{resources} {start}–{end} of {total}",
    calendarThisEvent: "This event", calendarThisAndFollowing: "This and following events", calendarAllEvents: "All events", calendarSources: "Calendars",
    calendarImportFailed: "Could not read {source}: {error}", calendarActions: "Actions for {title}", calendarOpen: "Open", calendarMove: "Move",
    calendarNewHere: "New event here", calendarOutsideRange: "Outside the dates this calendar shows", calendarClose: "Close", calendarDetailsOf: "Details of {title}"
  };
  /** The calendar's texts: the English defaults, then whatever the view and the host translated. */
  function calLabelsFor(labels) {
    const out = { ...CALENDAR_LABELS };
    for (const name of Object.keys(CALENDAR_LABELS)) if (Object.hasOwn(labels, name)) out[name] = labels[name];
    return Object.freeze(out);
  }
  /** A label with plural forms for a count, its {count} written in the page language. */
  function calCount(grid, template, count, values) {
    return fill(plural(template, count, grid.lang), { ...values, count: numberFormat(grid.lang).format(count) });
  }
