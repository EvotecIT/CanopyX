using System;
using System.Collections.Generic;
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

    // The CSS colour names (CSS Color Module Level 4) and transparent.
    private static readonly HashSet<string> ColorNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
        "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
        "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
        "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
        "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
        "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
        "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
        "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
        "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
        "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
        "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
        "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown",
        "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
        "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat",
        "white", "whitesmoke", "yellow", "yellowgreen"
    };
    private static readonly Regex HexColor = new Regex("^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
    // rgb()/hsl() with three components (numbers, percentages, an angle for hue) and an optional alpha, comma or space separated.
    private static readonly Regex FunctionColor = new Regex(@"^(rgba?|hsla?)\(\s*([+-]?[0-9.]+(?:%|deg)?)(?:\s*,\s*|\s+)([+-]?[0-9.]+%?)(?:\s*,\s*|\s+)([+-]?[0-9.]+%?)(?:\s*(?:,|/)\s*([0-9.]+%?))?\s*\)$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    /// <summary>Whether a value is a colour a calendar event accepts: a hex colour, an rgb()/hsl() colour or a CSS colour name.</summary>
    internal static bool IsColor(string value) {
        if (value == null) return false;
        var text = value.Trim();
        if (HexColor.IsMatch(text) || ColorNames.Contains(text)) return true;
        var match = FunctionColor.Match(text);
        if (!match.Success) return false;
        foreach (var group in new[] { match.Groups[2], match.Groups[3], match.Groups[4], match.Groups[5] }) {
            if (!group.Success) continue;
            var number = group.Value.TrimEnd('%').Replace("deg", string.Empty);
            if (!double.TryParse(number, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out _)) return false;
        }
        return true;
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
