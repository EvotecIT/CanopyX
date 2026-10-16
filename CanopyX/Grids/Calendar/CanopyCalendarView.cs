namespace CanopyX;

/// <summary>A view of a <see cref="CanopyCalendar"/>.</summary>
public enum CanopyCalendarView {
    /// <summary>A month grid of weeks, with events as bars in the day cells (<c>month</c>).</summary>
    Month = 0,

    /// <summary>A week of days with an all-day row and time slots (<c>week</c>).</summary>
    Week,

    /// <summary>One day with an all-day row and time slots (<c>day</c>).</summary>
    Day,

    /// <summary>A run of <see cref="CanopyCalendar.Days"/> days with time slots (<c>days</c>).</summary>
    Days,

    /// <summary>A list of the period's events grouped by day (<c>agenda</c>).</summary>
    Agenda,

    /// <summary>Twelve small months with the busy days marked (<c>year</c>).</summary>
    Year,

    /// <summary>A resource timeline: one lane per resource of <see cref="CanopyCalendar.Resources"/> along a time axis (<c>timeline</c>).</summary>
    Timeline
}
