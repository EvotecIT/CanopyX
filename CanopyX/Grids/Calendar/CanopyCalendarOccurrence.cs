namespace CanopyX;

/// <summary>What moving or resizing an occurrence of a repeating event of a <see cref="CanopyCalendar"/> changes.</summary>
public enum CanopyCalendarOccurrence {
    /// <summary>The reader chooses each time between this event, this and the following events, and all events (<c>ask</c>).</summary>
    Ask = 0,

    /// <summary>Only the occurrence, through an override record (<c>this</c>); needs <see cref="CanopyCalendar.Series"/> and <see cref="CanopyCalendar.RecurrenceId"/>.</summary>
    This,

    /// <summary>The occurrence and the ones after it, which become a new series (<c>following</c>); needs <see cref="CanopyCalendar.Series"/> and <see cref="CanopyCalendar.RecurrenceId"/>.</summary>
    Following,

    /// <summary>Every occurrence: the series record itself changes (<c>all</c>).</summary>
    All
}