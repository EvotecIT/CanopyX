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

    /// <summary>A timeline along a time axis (<c>timeline</c>): one lane per resource of <see cref="CanopyCalendar.Resources"/>, or without resources the events packed into rows by overlap.</summary>
    Timeline,

    /// <summary>A small month like a date picker, with a dot on each day that has events (<c>mini</c>).</summary>
    Mini,

    /// <summary>The week's events as a list per day, without a time axis (<c>weekList</c>).</summary>
    WeekList,

    /// <summary>The day's events as a list, without a time axis (<c>dayList</c>).</summary>
    DayList,

    /// <summary><see cref="CanopyCalendar.Months"/> stacked months that scroll (<c>months</c>).</summary>
    Months
}
