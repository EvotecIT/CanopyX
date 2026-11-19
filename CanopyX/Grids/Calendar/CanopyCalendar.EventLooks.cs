using System;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

// Per-event colours, an address per event and how it opens (docs/calendar.md#events).
public sealed partial class CanopyCalendar {
    private string? _color, _backgroundColor, _textColor, _url;

    /// <summary>
    /// Gets or sets the text column of each event's own colour (its bar, dot and, in the strong style, its fill), over its tone
    /// and its source's colour. Values are hex colours, <c>rgb()</c>/<c>hsl()</c> colours or CSS colour names; others are ignored.
    /// </summary>
    public string? Color { get => _color; set => _color = Column(value); }

    /// <summary>Gets or sets the text column of each event's background colour; alone it also colours the bar and dot.</summary>
    public string? BackgroundColor { get => _backgroundColor; set => _backgroundColor = Column(value); }

    /// <summary>Gets or sets the text column of each event's text colour.</summary>
    public string? TextColor { get => _textColor; set => _textColor = Column(value); }

    /// <summary>
    /// Gets or sets the text column of each event's address: activating the event opens it instead of its details, after a
    /// <c>canopyx:eventClick</c> listener or <c>onEventClick</c> hook that does not cancel. Only http(s), mailto and relative
    /// addresses open; others are ignored.
    /// </summary>
    public string? Url { get => _url; set => _url = Column(value); }

    /// <summary>Gets or sets whether event addresses open in a new window (without an opener) rather than the page itself.</summary>
    public bool OpenUrlInNewWindow { get; set; }

    private void WriteEventLooks(CanopyJsonWriter writer) {
        writer.OptionalProperty("color", _color).OptionalProperty("backgroundColor", _backgroundColor).OptionalProperty("textColor", _textColor).OptionalProperty("url", _url);
        if (OpenUrlInNewWindow) writer.Property("urlTarget", "blank");
    }

    private void ValidateEventLooks(System.Collections.Generic.Dictionary<string, CanopyColumn> columns) {
        Require(columns, _color, "color", CanopyColumnKind.Text);
        Require(columns, _backgroundColor, "backgroundColor", CanopyColumnKind.Text);
        Require(columns, _textColor, "textColor", CanopyColumnKind.Text);
        Require(columns, _url, "url", CanopyColumnKind.Text);
    }

    private static readonly Regex ColorPattern = new Regex(@"^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgba?|hsla?)\([0-9\s.,%/+-]{1,64}(?:deg)?[0-9\s.,%/+-]{0,32}\)|[a-zA-Z]{3,24})$",
        RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

    /// <summary>Whether a value is a colour a calendar event accepts.</summary>
    internal static bool IsColor(string value) => value != null && ColorPattern.IsMatch(value.Trim());

    /// <summary>Whether a value is an event address the calendar opens: http(s), mailto or relative, without control characters or backslashes.</summary>
    internal static bool IsEventUrl(string value) {
        if (value == null || value.Trim().Length == 0 || value.Length > 2048 || value.IndexOf('\\') >= 0) return false;
        foreach (var character in value) if (char.IsControl(character)) return false;
        var trimmed = value.Trim();
        var colon = trimmed.IndexOf(':');
        var separator = trimmed.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || separator >= 0 && separator < colon) return true;
        var scheme = trimmed.Substring(0, colon);
        return scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || scheme.Equals("https", StringComparison.OrdinalIgnoreCase) || scheme.Equals("mailto", StringComparison.OrdinalIgnoreCase);
    }
}
