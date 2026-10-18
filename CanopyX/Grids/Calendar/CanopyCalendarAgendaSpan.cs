namespace CanopyX;

/// <summary>The period the agenda of a <see cref="CanopyCalendar"/> lists.</summary>
public enum CanopyCalendarAgendaSpan {
    /// <summary>One day (<c>day</c>).</summary>
    Day = 0,

    /// <summary>One week (<c>week</c>).</summary>
    Week,

    /// <summary>One month (<c>month</c>). The default.</summary>
    Month,

    /// <summary>One year (<c>year</c>).</summary>
    Year
}