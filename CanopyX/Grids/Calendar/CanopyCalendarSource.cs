using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// An event source of a <see cref="CanopyCalendar"/>: a group of events with a label and a tone, which a legend switches on and
/// off. Records name their source in the <see cref="CanopyCalendar.Source"/> column; a source with an <see cref="Ics"/> file adds
/// that file's events, read-only.
/// </summary>
public sealed class CanopyCalendarSource {
    private string _id;
    private string _label;
    private string? _ics;

    /// <summary>Creates a source.</summary>
    /// <param name="id">The source id that records name in the source column, unique within the calendar.</param>
    /// <param name="label">The legend's label, 1 to 256 visible characters.</param>
    /// <exception cref="ArgumentException">The id is empty, or the label is blank or too long.</exception>
    public CanopyCalendarSource(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        _id = id;
        _label = CheckLabel(label, nameof(label));
    }

    /// <summary>Gets or sets the source id that records name in the source column, unique within the calendar.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string Id {
        get => _id;
        set { CanopyIdentifiers.Require(value, nameof(value)); _id = value; }
    }

    /// <summary>Gets or sets the legend's label, 1 to 256 visible characters.</summary>
    /// <exception cref="ArgumentException">The label is blank or longer than 256 characters.</exception>
    public string Label {
        get => _label;
        set => _label = CheckLabel(value, nameof(value));
    }

    /// <summary>Gets or sets the tone of the source's events; <see cref="CanopyTone.None"/> (the default) keeps each event's own tone.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>
    /// Gets or sets the URL of an iCalendar file whose events join the calendar read-only, with this source's id; null for none.
    /// It is a relative URL (resolved against the page) or an absolute URL starting with <c>http://</c> or <c>https://</c> (in
    /// lowercase) of the page's origin, which the browser checks; at most 2,048 characters without white space, backslashes or
    /// control characters. The browser reads the file within the limits of <see cref="CanopyICalendar"/> (docs/icalendar.md).
    /// </summary>
    /// <exception cref="ArgumentException">The value is empty, too long, has white space or control characters, starts with
    /// <c>//</c>, or names a scheme other than <c>http</c> or <c>https</c>.</exception>
    public string? Ics {
        get => _ics;
        set => _ics = value == null || IsIcsUrl(value) ? value : throw new ArgumentException("An iCalendar URL is a relative or same-origin http(s) URL of at most 2,048 characters without white space.", nameof(value));
    }

    /// <summary>Gets or sets whether the source starts switched off in the legend. Defaults to false.</summary>
    public bool Hidden { get; set; }

    private static string CheckLabel(string label, string parameter) =>
        CanopyCalendarValues.Label(label ?? throw new ArgumentException("A source needs a label.", parameter), parameter)!;

    /// <summary>Whether a value is a relative URL or an absolute http(s) URL, without white space or control characters.</summary>
    internal static bool IsIcsUrl(string value) {
        if (value.Length == 0 || value.Length > 2048) return false;
        foreach (var character in value) if (character <= ' ' || character == '\u007f' || character == '\\' || char.IsWhiteSpace(character)) return false;
        if (value.StartsWith("//", StringComparison.Ordinal)) return false;
        var colon = value.IndexOf(':');
        var end = value.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || end >= 0 && end < colon) return true;
        return value.StartsWith("https://", StringComparison.Ordinal) && value.Length > 8 || value.StartsWith("http://", StringComparison.Ordinal) && value.Length > 7;
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", _id).Property("label", _label).OptionalProperty("tone", Tone.Name).OptionalProperty("ics", _ics);
        if (Hidden) writer.Property("hidden", true);
        writer.EndObject();
    }
}
