using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A static range of a <see cref="CanopyCalendar"/>, drawn behind the events: a holiday, a change freeze, a maintenance window, or
/// time a resource is unavailable. It is not a record of the grid.
/// </summary>
public sealed class CanopyCalendarRange {
    private DateTime _start;
    private DateTime _end;
    private string _label;
    private string? _resource;

    /// <summary>Creates a range.</summary>
    /// <param name="start">When it starts. A local time is converted to UTC; an unspecified one is taken as UTC.</param>
    /// <param name="end">When it ends, after <paramref name="start"/>; the same conversion applies.</param>
    /// <param name="label">What it is, 1 to 256 visible characters.</param>
    /// <exception cref="ArgumentException">The label is blank or too long.</exception>
    public CanopyCalendarRange(DateTime start, DateTime end, string label) {
        Start = start;
        End = end;
        _label = CheckLabel(label);
    }

    /// <summary>Gets or sets when the range starts, in UTC. A local time is converted; an unspecified one is taken as UTC.</summary>
    public DateTime Start {
        get => _start;
        set => _start = CanopyCalendarValues.Utc(value);
    }

    /// <summary>Gets or sets when the range ends, in UTC, after <see cref="Start"/>. A local time is converted; an unspecified one is taken as UTC.</summary>
    public DateTime End {
        get => _end;
        set => _end = CanopyCalendarValues.Utc(value);
    }

    /// <summary>Gets or sets what the range is, 1 to 256 visible characters.</summary>
    /// <exception cref="ArgumentException">The label is blank or longer than 256 characters.</exception>
    public string Label {
        get => _label;
        set => _label = CheckLabel(value);
    }

    /// <summary>Gets or sets the range's tone; <see cref="CanopyTone.None"/> (the default) shades a background range with the info tone and an unavailable range with neutral hatching.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets the resource id (a node id of the resource tree) the range belongs to; null for every resource and the calendar views.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? Resource {
        get => _resource;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _resource = value; }
    }

    /// <summary>Gets or sets how the range is drawn. Defaults to <see cref="CanopyCalendarRangeKind.Background"/>.</summary>
    public CanopyCalendarRangeKind Kind { get; set; }

    /// <summary>Gets or sets a rule that repeats the range from its start (for example a weekly maintenance window); null for once.</summary>
    public CanopyRecurrence? Recurrence { get; set; }

    private static string CheckLabel(string label) => CanopyCalendarValues.Label(label ?? throw new ArgumentException("A range needs a label.", nameof(label)), nameof(label))!;

    internal void Validate() {
        if (_end <= _start) throw new InvalidOperationException("Range '" + _label + "' ends after it starts.");
        if (Kind != CanopyCalendarRangeKind.Background && Kind != CanopyCalendarRangeKind.Unavailable) throw new ArgumentOutOfRangeException(nameof(Kind), Kind, "Unknown range kind.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("start", CanopyCalendarValues.Iso(_start)).Property("end", CanopyCalendarValues.Iso(_end)).Property("label", _label)
            .OptionalProperty("tone", Tone.Name).OptionalProperty("resource", _resource);
        if (Kind == CanopyCalendarRangeKind.Unavailable) writer.Property("kind", "unavailable");
        writer.OptionalProperty("recurrence", Recurrence?.ToString()).EndObject();
    }
}
