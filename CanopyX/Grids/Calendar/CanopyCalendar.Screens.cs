using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

// Shared screens: a week on a wall tablet, a dashboard section or a phone (docs/calendar.md#shared-screens).
public sealed partial class CanopyCalendar {
    private string? _location;
    private double? _fadePast;
    private int? _listDays, _dayWidth, _listBelow;

    /// <summary>
    /// Gets or sets the text column of each event's location, shown in the details; with <see cref="Merge"/>, copies of one event
    /// match on it too. Null for none.
    /// </summary>
    public string? Location { get => _location; set => _location = Column(value); }

    /// <summary>Gets or sets how copies of one event in several sources merge into one; null (the default) draws every copy.</summary>
    public CanopyCalendarMerge? Merge { get; set; }

    /// <summary>
    /// Gets or sets how strongly events that have ended fade in the week, day, N-day, list and agenda views, 0.1 (barely) to 0.9;
    /// null (the default) does not fade them. Focus and hover bring an event back to full strength.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 0.1 to 0.9.</exception>
    public double? FadePast {
        get => _fadePast;
        set => _fadePast = value.HasValue && !(value.Value >= 0.1 && value.Value <= 0.9) ? throw new ArgumentOutOfRangeException(nameof(value), value, "Fading is 0.1 to 0.9.") : value;
    }

    /// <summary>Gets the notes shown in day headers, at most 1,000.</summary>
    public IList<CanopyCalendarDayNote> DayNotes { get; } = new List<CanopyCalendarDayNote>();

    /// <summary>Gets the faces of resources, at most 1,000, one per resource. Sources carry their faces themselves.</summary>
    public IList<CanopyCalendarFace> Faces { get; } = new List<CanopyCalendarFace>();

    /// <summary>
    /// Gets or sets how many days the week list shows from its date, 2 to 14, instead of the calendar week; null (the default)
    /// shows the week.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 2 to 14.</exception>
    public int? ListDays { get => _listDays; set => _listDays = Range(value, 2, 14, "The week list shows 2 to 14 days."); }

    /// <summary>
    /// Gets or sets the narrowest day column, 60 to 400 pixels, of the week, N-day and week list views: as the calendar (not the
    /// window) narrows they show one day fewer at a time, always keeping today, and step by the days shown. Null (the default)
    /// always shows every day.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 60 to 400.</exception>
    public int? DayWidth { get => _dayWidth; set => _dayWidth = Range(value, 60, 400, "A day column is 60 to 400 pixels wide."); }

    /// <summary>
    /// Gets or sets the fewest columns, 2 to 7, the week list shows side by side; with fewer it stacks its days as a list. Null
    /// (the default) never stacks.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 2 to 7.</exception>
    public int? ListBelow { get => _listBelow; set => _listBelow = Range(value, 2, 7, "The week list stacks below 2 to 7 columns."); }

    /// <summary>
    /// Gets or sets whether a Reset button appears once someone pages away, switches the view or hides a source, and restores the
    /// configured view, date, zoom and sources in one press. Defaults to false.
    /// </summary>
    public bool Reset { get; set; }

    private void ValidateScreens() {
        if (DayNotes.Count > 1000) throw new InvalidOperationException("A calendar has at most 1,000 day notes.");
        foreach (var note in DayNotes) if (note == null) throw new InvalidOperationException("Calendar day notes cannot be null.");
        if (Faces.Count > 1000) throw new InvalidOperationException("A calendar has at most 1,000 faces.");
        var resources = new HashSet<string>(StringComparer.Ordinal);
        foreach (var face in Faces) {
            if (face == null || !resources.Add(face.Resource)) throw new InvalidOperationException("Calendar faces name each resource once and cannot be null.");
            face.Validate();
        }
    }

    private void WriteScreensJson(CanopyJsonWriter writer) {
        if (Merge != null) { writer.Name("merge"); Merge.WriteJson(writer); }
        if (_fadePast.HasValue) writer.Name("fadePast").Number(Math.Round(_fadePast.Value, 2));
        if (DayNotes.Count > 0) {
            writer.Name("dayNotes").BeginArray();
            foreach (var note in DayNotes) note.WriteJson(writer);
            writer.EndArray();
        }
        if (Faces.Count > 0) {
            writer.Name("faces").BeginArray();
            foreach (var face in Faces) face.WriteJson(writer);
            writer.EndArray();
        }
        writer.OptionalProperty("listDays", _listDays).OptionalProperty("dayWidth", _dayWidth).OptionalProperty("listBelow", _listBelow);
        if (Reset) writer.Property("reset", true);
    }

    private static int? Range(int? value, int min, int max, string message) =>
        value.HasValue && (value.Value < min || value.Value > max) ? throw new ArgumentOutOfRangeException(nameof(value), value, message) : value;
}
