using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;

namespace CanopyX;

/// <summary>
/// A recurrence rule: the subset of RFC 5545 <c>RRULE</c> that CanopyX calendars expand, in C# and in the browser alike.
/// </summary>
/// <remarks>
/// <para>Build one fluently (<c>CanopyRecurrence.Weekly(DayOfWeek.Monday, DayOfWeek.Wednesday).Every(2).Times(10)</c>) or read
/// rule text with <see cref="Parse"/>; <see cref="ToString"/> writes the rule text a calendar's <c>recurrence</c> column holds.
/// The subset is <c>FREQ</c> (daily, weekly, monthly, yearly), <c>INTERVAL</c>, <c>COUNT</c> or <c>UNTIL</c>, <c>BYDAY</c> (numbered
/// weekdays only in monthly and yearly rules), <c>BYMONTHDAY</c> (not in weekly rules), <c>BYMONTH</c>, <c>BYSETPOS</c> and
/// <c>WKST</c>.</para>
/// <para><see cref="Occurrences(DateTime, TimeZoneInfo, DateTimeOffset?, DateTimeOffset?, string?)"/> expands a series as
/// RFC 5545 section 3.3.10 describes: the series start always counts as the first occurrence, occurrences keep its wall-clock
/// time in the series' time zone, a wall time that a daylight saving change skips moves forward by the length of the gap (it
/// keeps the offset before the change), and a wall time that occurs twice means its first occurrence.
/// <see cref="SeriesEnd(DateTime, TimeSpan, TimeZoneInfo, string?)"/> gives the end of the last occurrence, for a host's
/// <c>seriesEnd</c> column.</para>
/// </remarks>
public sealed partial class CanopyRecurrence {
    private readonly List<CanopyRecurrenceDay> _days = new List<CanopyRecurrenceDay>();
    private readonly List<int> _monthDays = new List<int>();
    private readonly List<int> _months = new List<int>();
    private readonly List<int> _positions = new List<int>();
    private int _interval = 1;
    private int? _count;
    private DateTime? _until;
    private bool _untilIsDate;

    private CanopyRecurrence(CanopyRecurrenceFrequency frequency) {
        Frequency = frequency;
        Days = new ReadOnlyCollection<CanopyRecurrenceDay>(_days);
        MonthDays = new ReadOnlyCollection<int>(_monthDays);
        Months = new ReadOnlyCollection<int>(_months);
        Positions = new ReadOnlyCollection<int>(_positions);
    }

    /// <summary>Starts a rule that repeats every day.</summary>
    /// <returns>A daily rule.</returns>
    public static CanopyRecurrence Daily() => new CanopyRecurrence(CanopyRecurrenceFrequency.Daily);

    /// <summary>Starts a rule that repeats every week, on the given weekdays or, with none, on the series start's weekday.</summary>
    /// <param name="days">The weekdays.</param>
    /// <returns>A weekly rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="days"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A weekday is unknown.</exception>
    public static CanopyRecurrence Weekly(params DayOfWeek[] days) => new CanopyRecurrence(CanopyRecurrenceFrequency.Weekly).On(days);

    /// <summary>Starts a rule that repeats every month, on the series start's day of the month unless days are given.</summary>
    /// <returns>A monthly rule.</returns>
    public static CanopyRecurrence Monthly() => new CanopyRecurrence(CanopyRecurrenceFrequency.Monthly);

    /// <summary>Starts a rule that repeats every year, on the series start's date unless months or days are given.</summary>
    /// <returns>A yearly rule.</returns>
    public static CanopyRecurrence Yearly() => new CanopyRecurrence(CanopyRecurrenceFrequency.Yearly);

    /// <summary>Gets how often the rule repeats.</summary>
    public CanopyRecurrenceFrequency Frequency { get; }

    /// <summary>Gets the number of periods between repetitions, 1 to 9,999. Defaults to 1.</summary>
    public int Interval => _interval;

    /// <summary>Gets how many occurrences the series has, the series start included; null when it ends by date or never.</summary>
    public int? Count => _count;

    /// <summary>
    /// Gets the last moment an occurrence may start (inclusive), or null: a UTC instant (<see cref="DateTimeKind.Utc"/>), a wall time
    /// in the series' time zone (<see cref="DateTimeKind.Unspecified"/>), or a date when <see cref="UntilIsDate"/> is true.
    /// </summary>
    public DateTime? UntilValue => _until;

    /// <summary>Gets whether <see cref="UntilValue"/> is a date: every occurrence that starts on that day, in the series' time zone, still counts.</summary>
    public bool UntilIsDate => _untilIsDate;

    /// <summary>Gets the weekdays (<c>BYDAY</c>), in the order given.</summary>
    public IReadOnlyList<CanopyRecurrenceDay> Days { get; }

    /// <summary>Gets the days of the month (<c>BYMONTHDAY</c>), 1 to 31 or -31 to -1 from the end of the month.</summary>
    public IReadOnlyList<int> MonthDays { get; }

    /// <summary>Gets the months (<c>BYMONTH</c>), 1 to 12.</summary>
    public IReadOnlyList<int> Months { get; }

    /// <summary>Gets the positions (<c>BYSETPOS</c>) chosen within each period's matching days, 1 to 366 or -366 to -1 from the end.</summary>
    public IReadOnlyList<int> Positions { get; }

    /// <summary>Gets the first day of the week (<c>WKST</c>), which places the weeks of a weekly rule. Defaults to Monday.</summary>
    public DayOfWeek WeekStart { get; private set; } = DayOfWeek.Monday;

    /// <summary>Repeats every <paramref name="interval"/> periods instead of every period.</summary>
    /// <param name="interval">1 to 9,999.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The interval is outside 1 to 9,999.</exception>
    public CanopyRecurrence Every(int interval) {
        if (interval < 1 || interval > 9999) throw new ArgumentOutOfRangeException(nameof(interval), interval, "An interval is 1 to 9,999.");
        _interval = interval;
        return this;
    }

    /// <summary>Ends the series after <paramref name="count"/> occurrences, the series start included.</summary>
    /// <param name="count">1 to 9,999.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 1 to 9,999.</exception>
    /// <exception cref="InvalidOperationException">The rule already ends by date.</exception>
    public CanopyRecurrence Times(int count) {
        if (count < 1 || count > 9999) throw new ArgumentOutOfRangeException(nameof(count), count, "A count is 1 to 9,999.");
        if (_until.HasValue) throw new InvalidOperationException("A rule ends either after a count or by a date, not both.");
        _count = count;
        return this;
    }

    /// <summary>
    /// Ends the series on a date or at a moment (inclusive): a UTC time is an instant, a local time is converted to UTC, and an
    /// unspecified time is a wall time in the series' time zone, or a date when it is midnight.
    /// </summary>
    /// <param name="until">The last date or moment an occurrence may start.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="InvalidOperationException">The rule already ends after a count.</exception>
    public CanopyRecurrence Until(DateTime until) {
        if (_count.HasValue) throw new InvalidOperationException("A rule ends either after a count or by a date, not both.");
        if (until.Kind == DateTimeKind.Local) until = until.ToUniversalTime();
        _untilIsDate = until.Kind == DateTimeKind.Unspecified && until.TimeOfDay == TimeSpan.Zero;
        _until = Truncate(until);
        return this;
    }

    /// <summary>Ends the series at a moment (inclusive).</summary>
    /// <param name="until">The last moment an occurrence may start.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="InvalidOperationException">The rule already ends after a count.</exception>
    public CanopyRecurrence Until(DateTimeOffset until) => Until(until.UtcDateTime);

    /// <summary>Adds weekdays (<c>BYDAY</c>): every such weekday of the period.</summary>
    /// <param name="days">The weekdays.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="days"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A weekday is unknown.</exception>
    public CanopyRecurrence On(params DayOfWeek[] days) {
        if (days == null) throw new ArgumentNullException(nameof(days));
        foreach (var day in days) _days.Add(new CanopyRecurrenceDay(day));
        return this;
    }

    /// <summary>Adds a numbered weekday (<c>BYDAY</c> such as <c>2TU</c> or <c>-1FR</c>) to a monthly or yearly rule.</summary>
    /// <param name="ordinal">1 to 53 from the start of the month (or of the year, for a yearly rule without months), -1 to -53 from its end.</param>
    /// <param name="day">The weekday.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The number is 0 or outside -53 to 53, or the weekday is unknown.</exception>
    /// <exception cref="InvalidOperationException">The rule is daily or weekly.</exception>
    public CanopyRecurrence On(int ordinal, DayOfWeek day) {
        if (ordinal == 0) throw new ArgumentOutOfRangeException(nameof(ordinal), ordinal, "A numbered weekday needs a number from -53 to 53 other than 0.");
        var entry = new CanopyRecurrenceDay(day, ordinal);
        if (Frequency != CanopyRecurrenceFrequency.Monthly && Frequency != CanopyRecurrenceFrequency.Yearly) throw new InvalidOperationException("Numbered weekdays belong to monthly and yearly rules.");
        _days.Add(entry);
        return this;
    }

    /// <summary>Adds days of the month (<c>BYMONTHDAY</c>); a day a month does not have is skipped in that month.</summary>
    /// <param name="days">1 to 31, or -31 to -1 counting from the end of the month (-1 is the last day).</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="days"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A day is 0 or outside -31 to 31.</exception>
    /// <exception cref="InvalidOperationException">The rule is weekly.</exception>
    public CanopyRecurrence OnMonthDays(params int[] days) {
        if (days == null) throw new ArgumentNullException(nameof(days));
        if (Frequency == CanopyRecurrenceFrequency.Weekly) throw new InvalidOperationException("A weekly rule cannot name days of the month.");
        foreach (var day in days) if (day == 0 || day < -31 || day > 31) throw new ArgumentOutOfRangeException(nameof(days), day, "A day of the month is 1 to 31 or -31 to -1.");
        _monthDays.AddRange(days);
        return this;
    }

    /// <summary>Adds months (<c>BYMONTH</c>): the rule repeats only in them.</summary>
    /// <param name="months">1 (January) to 12.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="months"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A month is outside 1 to 12.</exception>
    public CanopyRecurrence InMonths(params int[] months) {
        if (months == null) throw new ArgumentNullException(nameof(months));
        foreach (var month in months) if (month < 1 || month > 12) throw new ArgumentOutOfRangeException(nameof(months), month, "A month is 1 to 12.");
        _months.AddRange(months);
        return this;
    }

    /// <summary>Adds positions (<c>BYSETPOS</c>): of each period's matching days, only these count (-1 is the last).</summary>
    /// <param name="positions">1 to 366, or -366 to -1 counting from the end.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="positions"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">A position is 0 or outside -366 to 366.</exception>
    public CanopyRecurrence AtPositions(params int[] positions) {
        if (positions == null) throw new ArgumentNullException(nameof(positions));
        foreach (var position in positions) if (position == 0 || position < -366 || position > 366) throw new ArgumentOutOfRangeException(nameof(positions), position, "A position is 1 to 366 or -366 to -1.");
        _positions.AddRange(positions);
        return this;
    }

    /// <summary>Sets the first day of the week (<c>WKST</c>), which places the weeks of a weekly rule.</summary>
    /// <param name="day">The weekday weeks start on.</param>
    /// <returns>This rule.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The weekday is unknown.</exception>
    public CanopyRecurrence WeekStartsOn(DayOfWeek day) {
        if (day < DayOfWeek.Sunday || day > DayOfWeek.Saturday) throw new ArgumentOutOfRangeException(nameof(day), day, "Unknown weekday.");
        WeekStart = day;
        return this;
    }

    /// <summary>
    /// Returns the rule text without the <c>RRULE:</c> prefix, in canonical order:
    /// <c>FREQ</c>, <c>INTERVAL</c> (when not 1), <c>COUNT</c> or <c>UNTIL</c>, <c>BYMONTH</c>, <c>BYMONTHDAY</c>, <c>BYDAY</c>,
    /// <c>BYSETPOS</c>, <c>WKST</c> (when not Monday).
    /// </summary>
    /// <returns>For example <c>FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE</c>.</returns>
    public override string ToString() {
        var text = new StringBuilder("FREQ=").Append(FrequencyName(Frequency));
        if (_interval != 1) text.Append(";INTERVAL=").Append(_interval.ToString(CultureInfo.InvariantCulture));
        if (_count.HasValue) text.Append(";COUNT=").Append(_count.Value.ToString(CultureInfo.InvariantCulture));
        if (_until.HasValue) text.Append(";UNTIL=").Append(FormatUntil(_until.Value, _untilIsDate));
        Append(text, "BYMONTH", _months);
        Append(text, "BYMONTHDAY", _monthDays);
        if (_days.Count > 0) {
            text.Append(";BYDAY=");
            for (var index = 0; index < _days.Count; index++) text.Append(index == 0 ? string.Empty : ",").Append(_days[index].ToString());
        }
        Append(text, "BYSETPOS", _positions);
        if (WeekStart != DayOfWeek.Monday) text.Append(";WKST=").Append(CanopyRecurrenceDay.Code(WeekStart));
        return text.ToString();
    }

    private static void Append(StringBuilder text, string name, List<int> values) {
        if (values.Count == 0) return;
        text.Append(';').Append(name).Append('=');
        for (var index = 0; index < values.Count; index++) text.Append(index == 0 ? string.Empty : ",").Append(values[index].ToString(CultureInfo.InvariantCulture));
    }

    private static string FrequencyName(CanopyRecurrenceFrequency frequency) => frequency switch {
        CanopyRecurrenceFrequency.Daily => "DAILY",
        CanopyRecurrenceFrequency.Weekly => "WEEKLY",
        CanopyRecurrenceFrequency.Monthly => "MONTHLY",
        _ => "YEARLY"
    };

    private static string FormatUntil(DateTime until, bool date) =>
        date ? until.ToString("yyyyMMdd", CultureInfo.InvariantCulture)
            : until.ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture) + (until.Kind == DateTimeKind.Utc ? "Z" : string.Empty);

    /// <summary>Drops the fraction of a second, which rule text cannot carry.</summary>
    private static DateTime Truncate(DateTime value) => new DateTime(value.Ticks - value.Ticks % TimeSpan.TicksPerSecond, value.Kind);
}
