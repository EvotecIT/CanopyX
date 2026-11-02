using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A short note in a day's header of a <see cref="CanopyCalendar"/>: the weather, a count, a badge. It shows in the week, day,
/// N-day, list and agenda headers and in a corner of month days, and joins the day's accessible name. Notes are text; a page
/// that computes its notes uses the <c>dayHeader</c> hook of the browser runtime instead.
/// </summary>
public sealed class CanopyCalendarDayNote {
    private DateTime _date;
    private string _text;

    /// <summary>Creates a note.</summary>
    /// <param name="date">The day, its date part only.</param>
    /// <param name="text">The note, 1 to 64 visible characters.</param>
    /// <exception cref="ArgumentException">The text is blank or longer than 64 characters.</exception>
    public CanopyCalendarDayNote(DateTime date, string text) {
        _date = date.Date;
        _text = CheckText(text, nameof(text));
    }

    /// <summary>Gets or sets the day, its date part only.</summary>
    public DateTime Date { get => _date; set => _date = value.Date; }

    /// <summary>Gets or sets the note, 1 to 64 visible characters.</summary>
    /// <exception cref="ArgumentException">The text is blank or longer than 64 characters.</exception>
    public string Text { get => _text; set => _text = CheckText(value, nameof(value)); }

    /// <summary>Gets or sets the note's tone; <see cref="CanopyTone.None"/> (the default) draws it muted.</summary>
    public CanopyTone Tone { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) =>
        writer.BeginObject().Property("date", CanopyCalendarValues.Date(_date)).Property("text", _text).OptionalProperty("tone", Tone.Name).EndObject();

    private static string CheckText(string text, string parameter) =>
        text != null && text.Trim().Length > 0 && text.Length <= 64 ? text.Trim() : throw new ArgumentException("A day note needs 1 to 64 visible characters.", parameter);
}
