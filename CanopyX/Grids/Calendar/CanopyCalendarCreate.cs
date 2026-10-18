using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// How readers create events in a <see cref="CanopyCalendar"/>: by clicking an empty slot or day, dragging over a range, or from
/// the keyboard. A new instance allows both timed and all-day creation with one-hour clicked events and writes <c>"create": true</c>.
/// </summary>
/// <remarks>New records travel as inserts of the grid's change set (a <c>gridCommit</c> row with <c>"op": "insert"</c> for a hosted
/// grid), so the host's writer decides what is saved. The start and title columns must be editable grid columns.</remarks>
public sealed class CanopyCalendarCreate {
    private int _minutes = 60;

    /// <summary>Gets or sets the length of the event a click on a time slot creates, 5 to 1,440 minutes. Defaults to 60.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 5 to 1,440.</exception>
    public int Minutes {
        get => _minutes;
        set => _minutes = value < 5 || value > 1440 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A created event lasts 5 to 1,440 minutes.") : value;
    }

    /// <summary>Gets or sets whether readers can create all-day events in the month view and the all-day rows. Defaults to true.</summary>
    public bool AllDay { get; set; } = true;

    internal void WriteJson(CanopyJsonWriter writer) {
        if (_minutes == 60 && AllDay) { writer.Boolean(true); return; }
        writer.BeginObject();
        if (_minutes != 60) writer.Property("minutes", _minutes);
        if (!AllDay) writer.Property("allDay", false);
        writer.EndObject();
    }
}
