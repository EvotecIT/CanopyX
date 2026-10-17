namespace CanopyX;

/// <summary>
/// A starting point for a <see cref="CanopyCalendar"/>'s settings (<see cref="CanopyCalendar.ApplyPreset"/>). A preset only sets
/// defaults: settings changed after it override it, and the document carries the resulting settings.
/// </summary>
public enum CanopyCalendarPreset {
    /// <summary>
    /// A plain read-only calendar: no grid toolbar, a details popover, and the month, week, day and agenda views. The default of
    /// calendars built from events.
    /// </summary>
    Basic = 0,

    /// <summary>
    /// A calendar with search, filters and export above it, a details popover, a Print button, and the month, week, day, N-day,
    /// agenda and year views.
    /// </summary>
    Standard,

    /// <summary>
    /// An editable scheduler: search, filters, saved views and export above it, the record drawer, a Print button, moving,
    /// resizing and creating events, the month, week, day and agenda views, and with resources the timeline with a concurrency
    /// lane (warning from 3 events at once, danger from 5).
    /// </summary>
    Scheduler
}