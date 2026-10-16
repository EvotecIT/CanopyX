using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>The period a <see cref="CanopyCalendar"/>'s timeline shows instead of its zoom's default, for example two weeks at day zoom.</summary>
public sealed class CanopyCalendarSpan {
    private int _count;
    private CanopyCalendarSpanUnit _unit;

    /// <summary>Creates a span.</summary>
    /// <param name="count">How many units, 1 to 366.</param>
    /// <param name="unit">The unit.</param>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="count"/> is outside 1 to 366, or <paramref name="unit"/> is unknown.</exception>
    public CanopyCalendarSpan(int count, CanopyCalendarSpanUnit unit) {
        Count = count;
        Unit = unit;
    }

    /// <summary>Gets or sets how many units the timeline shows, 1 to 366.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 366.</exception>
    public int Count {
        get => _count;
        set => _count = value < 1 || value > 366 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A timeline span is 1 to 366 units.") : value;
    }

    /// <summary>Gets or sets the unit.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not a known unit.</exception>
    public CanopyCalendarSpanUnit Unit {
        get => _unit;
        set => _unit = value < CanopyCalendarSpanUnit.Day || value > CanopyCalendarSpanUnit.Month ? throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown span unit.") : value;
    }

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("count", _count).Property("unit", CanopyCalendarValues.Name(_unit)).EndObject();
}
