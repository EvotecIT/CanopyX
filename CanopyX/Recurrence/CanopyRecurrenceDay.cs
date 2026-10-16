using System;
using System.Globalization;

namespace CanopyX;

/// <summary>
/// A weekday of a <see cref="CanopyRecurrence"/> (<c>BYDAY</c>), optionally numbered: <c>MO</c> is every Monday, <c>2TU</c> the
/// second Tuesday and <c>-1FR</c> the last Friday of the month (or of the year, for a yearly rule without months).
/// </summary>
public readonly struct CanopyRecurrenceDay : IEquatable<CanopyRecurrenceDay> {
    /// <summary>Creates a weekday, numbered or not.</summary>
    /// <param name="day">The weekday.</param>
    /// <param name="ordinal">0 for every such weekday; 1 to 53 counts from the start of the month or year, -1 to -53 from its end.</param>
    /// <exception cref="ArgumentOutOfRangeException">The weekday is unknown, or the number is outside -53 to 53.</exception>
    public CanopyRecurrenceDay(DayOfWeek day, int ordinal = 0) {
        if (day < DayOfWeek.Sunday || day > DayOfWeek.Saturday) throw new ArgumentOutOfRangeException(nameof(day), day, "Unknown weekday.");
        if (ordinal < -53 || ordinal > 53) throw new ArgumentOutOfRangeException(nameof(ordinal), ordinal, "A weekday's number is -53 to 53; 0 means every such weekday.");
        Day = day;
        Ordinal = ordinal;
    }

    /// <summary>Gets the weekday.</summary>
    public DayOfWeek Day { get; }

    /// <summary>Gets the number: 0 for every such weekday, a positive number from the start of the period, a negative one from its end.</summary>
    public int Ordinal { get; }

    /// <summary>Returns whether two weekdays have the same day and number.</summary>
    /// <param name="left">The first weekday.</param>
    /// <param name="right">The second weekday.</param>
    public static bool operator ==(CanopyRecurrenceDay left, CanopyRecurrenceDay right) => left.Equals(right);

    /// <summary>Returns whether two weekdays differ in day or number.</summary>
    /// <param name="left">The first weekday.</param>
    /// <param name="right">The second weekday.</param>
    public static bool operator !=(CanopyRecurrenceDay left, CanopyRecurrenceDay right) => !left.Equals(right);

    /// <inheritdoc />
    public bool Equals(CanopyRecurrenceDay other) => Day == other.Day && Ordinal == other.Ordinal;

    /// <inheritdoc />
    public override bool Equals(object? obj) => obj is CanopyRecurrenceDay other && Equals(other);

    /// <inheritdoc />
    public override int GetHashCode() => (int)Day * 397 ^ Ordinal;

    /// <summary>Returns the rule text of the weekday, for example <c>MO</c>, <c>2TU</c> or <c>-1FR</c>.</summary>
    public override string ToString() => (Ordinal == 0 ? string.Empty : Ordinal.ToString(CultureInfo.InvariantCulture)) + Code(Day);

    internal static string Code(DayOfWeek day) => Codes[(int)day];

    internal static bool TryParseCode(string text, out DayOfWeek day) {
        for (var index = 0; index < Codes.Length; index++) {
            if (string.Equals(Codes[index], text, StringComparison.OrdinalIgnoreCase)) { day = (DayOfWeek)index; return true; }
        }
        day = DayOfWeek.Sunday;
        return false;
    }

    private static readonly string[] Codes = { "SU", "MO", "TU", "WE", "TH", "FR", "SA" };
}
