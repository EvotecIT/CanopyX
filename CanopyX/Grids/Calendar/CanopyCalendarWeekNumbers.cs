namespace CanopyX;

/// <summary>Which week numbers a <see cref="CanopyCalendar"/> shows in the month, week and stacked months views.</summary>
public enum CanopyCalendarWeekNumbers {
    /// <summary>No week numbers (<c>false</c>). The default.</summary>
    None = 0,

    /// <summary>ISO 8601 week numbers: weeks start on Monday and week 1 holds the year's first Thursday (<c>iso</c>).</summary>
    Iso,

    /// <summary>Week numbers of the page language's calendar conventions (<c>locale</c>).</summary>
    Locale
}