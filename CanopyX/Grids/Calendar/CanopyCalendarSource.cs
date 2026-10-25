using System;
using System.Collections.Generic;
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
    private string? _url, _color;

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

    /// <summary>Gets or sets a same-origin JSON feed URL. Receives start, end and timeZone query parameters for the visible range and returns an array of calendar events. Mutually exclusive with <see cref="Ics"/>.</summary>
    public string? Url {
        get => _url;
        set => _url = value == null || IsIcsUrl(value) ? value : throw new ArgumentException("A JSON feed needs a relative or same-origin http(s) URL.", nameof(value));
    }

    /// <summary>Gets the extra query parameters sent with each JSON feed request. Reserved start, end and timeZone parameters are supplied by the calendar.</summary>
    public IDictionary<string, string> FetchParams { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets or sets a source colour in six-digit hexadecimal form, for example #2563eb. Null keeps the theme tone.</summary>
    public string? Color {
        get => _color;
        set {
            if (value != null && !System.Text.RegularExpressions.Regex.IsMatch(value, "^#[0-9a-fA-F]{6}$")) throw new ArgumentException("A source colour is #RRGGBB.", nameof(value));
            _color = value;
        }
    }

    internal void Validate() {
        if (_ics != null && _url != null) throw new InvalidOperationException("A calendar source has one feed: url or ics.");
        if (FetchParams.Count > 50 || FetchParams.Count > 0 && _url == null) throw new InvalidOperationException("At most 50 fetch parameters belong to a JSON feed.");
        foreach (var pair in FetchParams) {
            if (string.IsNullOrWhiteSpace(pair.Key) || pair.Key.Length > 128 || pair.Value == null || pair.Value.Length > 2048 || pair.Key == "start" || pair.Key == "end" || pair.Key == "timeZone")
                throw new InvalidOperationException("JSON feed parameters need a name and a value; start, end and timeZone are reserved.");
        }
    }

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
        Validate();
        writer.BeginObject().Property("id", _id).Property("label", _label).OptionalProperty("tone", Tone.Name).OptionalProperty("ics", _ics);
        writer.OptionalProperty("url", _url).OptionalProperty("color", _color);
        if (FetchParams.Count > 0) {
            writer.Name("fetchParams").BeginObject();
            foreach (var pair in FetchParams) writer.Property(pair.Key, pair.Value);
            writer.EndObject();
        }
        if (Hidden) writer.Property("hidden", true);
        writer.EndObject();
    }
}
