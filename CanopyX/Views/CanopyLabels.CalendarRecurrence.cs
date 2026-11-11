namespace CanopyX;

// The words of a recurrence rule's description (CanopyRecurrence.Describe and the calendar's details). Weekday and month names,
// dates and numbers come from the culture; these labels are the words around them.
public sealed partial class CanopyLabels {
    /// <summary>Gets or sets a rule that repeats every day. Default "every day".</summary>
    public string CalendarRecurrenceDaily { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every few days, with <c>{count}</c> (2 or more). Default "every {count} days".</summary>
    public string CalendarRecurrenceDailyInterval { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every week. Default "every week".</summary>
    public string CalendarRecurrenceWeekly { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every few weeks, with <c>{count}</c> (2 or more). Default "every {count} weeks".</summary>
    public string CalendarRecurrenceWeeklyInterval { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every month. Default "every month".</summary>
    public string CalendarRecurrenceMonthly { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every few months, with <c>{count}</c> (2 or more). Default "every {count} months".</summary>
    public string CalendarRecurrenceMonthlyInterval { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every year. Default "every year".</summary>
    public string CalendarRecurrenceYearly { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats every few years, with <c>{count}</c> (2 or more). Default "every {count} years".</summary>
    public string CalendarRecurrenceYearlyInterval { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the weekdays a rule repeats on, with <c>{days}</c> (<see cref="CalendarRecurrenceOnDay"/> phrases, or numbered weekdays). Default "on {days}".</summary>
    public string CalendarRecurrenceOn { get => Get(); set => Set(value); }

    /// <summary>
    /// Gets or sets a weekday in <see cref="CalendarRecurrenceOn"/>: one phrase, or seven (Monday to Sunday) separated by <c>|</c>;
    /// <c>{day}</c> is the culture's weekday name, which a phrase may write out in its own case instead. Default "{day}".
    /// </summary>
    public string CalendarRecurrenceOnDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the weekdays of a rule that repeats every week, with <c>{days}</c> (<see cref="CalendarRecurrenceEveryDay"/> phrases). Default "every {days}".</summary>
    public string CalendarRecurrenceEvery { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a weekday in <see cref="CalendarRecurrenceEvery"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "{day}".</summary>
    public string CalendarRecurrenceEveryDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats Monday to Friday. Default "on weekdays".</summary>
    public string CalendarRecurrenceWeekdays { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats on Saturday and Sunday. Default "on weekends".</summary>
    public string CalendarRecurrenceWeekends { get => Get(); set => Set(value); }

    /// <summary>Gets or sets three or more consecutive weekdays, with <c>{first}</c> and <c>{last}</c>. Default "{first} through {last}".</summary>
    public string CalendarRecurrenceDayRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a weekday in <see cref="CalendarRecurrenceDayRange"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "{day}".</summary>
    public string CalendarRecurrenceRangeDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a list of two or more names, with <c>{items}</c> (all but the last, separated by commas) and <c>{last}</c>. Default "{items} and {last}".</summary>
    public string CalendarRecurrenceList { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the days of the month a rule repeats on, with <c>{days}</c>; plural forms follow how many days. Default "[one]on day {days}[other]on days {days}".</summary>
    public string CalendarRecurrenceMonthDays { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a rule that repeats on the last day of the month. Default "on the last day of the month".</summary>
    public string CalendarRecurrenceLastDay { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the first weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the first {day}".</summary>
    public string CalendarRecurrenceFirstWeekday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the second weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the second {day}".</summary>
    public string CalendarRecurrenceSecondWeekday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the third weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the third {day}".</summary>
    public string CalendarRecurrenceThirdWeekday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the fourth weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the fourth {day}".</summary>
    public string CalendarRecurrenceFourthWeekday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the fifth weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the fifth {day}".</summary>
    public string CalendarRecurrenceFifthWeekday { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the last weekday of a month in <see cref="CalendarRecurrenceOn"/>, one phrase or seven as <see cref="CalendarRecurrenceOnDay"/>. Default "the last {day}".</summary>
    public string CalendarRecurrenceLastWeekday { get => Get(); set => Set(value); }

    /// <summary>
    /// Gets or sets a month a rule repeats in: one phrase, or twelve (January to December) separated by <c>|</c>; <c>{month}</c> is
    /// the culture's month name, which a phrase may write out in its own case instead. Several months join with
    /// <see cref="CalendarRecurrenceList"/>, and a later phrase that opens with the first phrase's opening word drops it ("in January
    /// and July", "w styczniu i lipcu"). Default "in {month}".
    /// </summary>
    public string CalendarRecurrenceInMonth { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the date a yearly rule repeats on, with <c>{date}</c> (day and month). Default "on {date}".</summary>
    public string CalendarRecurrenceOnDate { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the time of day a series starts, with <c>{time}</c>. Default "at {time}".</summary>
    public string CalendarRecurrenceAt { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a series that ends after a number of occurrences, with <c>{count}</c>. Default "[one]{count} time[other]{count} times".</summary>
    public string CalendarRecurrenceTimes { get => Get(); set => Set(value); }

    /// <summary>Gets or sets a series that ends on a date, with <c>{date}</c>. Default "until {date}".</summary>
    public string CalendarRecurrenceUntil { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the dates a series leaves out, with <c>{count}</c>. Default "[one]except {count} date[other]except {count} dates".</summary>
    public string CalendarRecurrenceExcept { get => Get(); set => Set(value); }
}
