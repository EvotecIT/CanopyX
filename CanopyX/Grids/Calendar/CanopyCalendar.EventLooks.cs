using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

// An address per event and how it opens (docs/calendar.md#events). Events take their colours from tones only.
public sealed partial class CanopyCalendar {
    private string? _url;

    /// <summary>
    /// Gets or sets the text column of each event's address: activating the event opens it instead of its details, after a
    /// <c>canopyx:eventClick</c> listener or <c>onEventClick</c> hook that does not cancel. Only http(s), mailto and relative
    /// addresses open; others are ignored.
    /// </summary>
    public string? Url { get => _url; set => _url = Column(value); }

    /// <summary>Gets or sets whether event addresses open in a new window (without an opener) rather than the page itself.</summary>
    public bool OpenUrlInNewWindow { get; set; }

    private void WriteEventLooks(CanopyJsonWriter writer) {
        writer.OptionalProperty("url", _url);
        if (OpenUrlInNewWindow) writer.Property("urlTarget", "blank");
    }

    private void ValidateEventLooks(System.Collections.Generic.Dictionary<string, CanopyColumn> columns) {
        Require(columns, _url, "url", CanopyColumnKind.Text);
    }


    /// <summary>Whether a value is an event address the calendar opens: http(s), mailto or relative, without control characters, backslashes or a //host form.</summary>
    internal static bool IsEventUrl(string value) {
        if (value == null || value.Trim().Length == 0 || value.Length > 2048 || value.IndexOf('\\') >= 0) return false;
        foreach (var character in value) if (char.IsControl(character)) return false;
        var trimmed = value.Trim();
        if (trimmed.StartsWith("//", StringComparison.Ordinal)) return false;
        var colon = trimmed.IndexOf(':');
        var separator = trimmed.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || separator >= 0 && separator < colon) return true;
        var scheme = trimmed.Substring(0, colon);
        return scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || scheme.Equals("https", StringComparison.OrdinalIgnoreCase) || scheme.Equals("mailto", StringComparison.OrdinalIgnoreCase);
    }
}
