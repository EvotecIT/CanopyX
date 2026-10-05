using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX.Rendering;

/// <summary>
/// The inline styles of one static outline, resolved once from its options. Email clients drop stylesheets and ignore
/// CSS custom properties, so every colour is written as a literal. With
/// <see cref="CanopyStaticHtmlOptions.UseThemeVariables"/> each literal is followed by the same declaration in terms
/// of the runtime's custom properties: a client that does not know <c>var()</c> drops that declaration and keeps the
/// literal, and a browser takes the colours the page defines. (A browser that knows <c>var()</c> but not
/// <c>color-mix()</c>, from before 2023, loses the mixed colours: muted text and tints fall back to the inherited
/// colour and no background, which stays legible.)
/// </summary>
internal sealed class CanopyStaticStyles {
    private const string BadgeShape = "display:inline-block;margin-left:6px;padding:0 6px;border-radius:9px;font-size:11px;";

    private readonly CanopyStaticHtmlOptions _options;
    private readonly bool _variables;
    private readonly Ink _surface;
    private readonly Ink _text;
    private readonly Ink _line;
    private readonly Ink _muted;
    private readonly Ink _quiet;
    private readonly Dictionary<string, string> _toneColors = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _badges = new Dictionary<string, string>(StringComparer.Ordinal);

    internal CanopyStaticStyles(CanopyStaticHtmlOptions options) {
        _options = options;
        _variables = options.UseThemeVariables;
        var theme = options.Theme;
        _surface = Base("--cx-surface", theme.Surface);
        _text = Base("--cx-text", theme.Text);
        _line = Base("--cx-line", theme.Line);
        // The mixes of canopyx.css: --cx-muted, --cx-alt-bg, --cx-line-strong, and --cx-head-bg.
        _muted = Mix(_text, 66, _surface);
        _quiet = Mix(_text, 2.5, _surface);
        var strong = Mix(_text, 22, _surface);
        var mutedColor = Declare("color", _muted);
        var rowLine = Border("border-bottom", _line);

        Table = "border-collapse:collapse;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;" + Declare("color", _text) + Declare("background", _surface);
        // A caption lies outside the table's own box, so it carries the surface itself.
        Caption = "text-align:left;font-weight:600;font-size:14px;padding:4px 8px 6px 8px;" + Declare("background", _surface);
        Header = "text-align:left;font-weight:700;padding:4px 12px;" + Border("border-bottom", strong) + Declare("background", Mix(_text, theme.Surface == "#16181c" ? 4.5 : 3.5, _surface)) + "white-space:nowrap;";
        Cell = "padding:3px 8px;" + rowLine + "vertical-align:top;";
        Detail = "padding:4px 8px 6px 8px;" + rowLine + Declare("background", _quiet);
        DetailCaption = "text-align:left;" + mutedColor + "padding:0 0 2px 0;";
        InnerTable = "border-collapse:collapse;font-size:12px;";
        InnerHeader = "text-align:left;font-weight:600;padding:2px 6px;" + Border("border-bottom", strong);
        PropertyName = "text-align:left;padding:2px 6px;" + mutedColor + "font-weight:400;";
        InnerCell = "padding:2px 6px;" + rowLine + "vertical-align:top;";
        Note = "padding:6px 8px;font-size:12px;font-weight:400;text-align:left;" + mutedColor;
        Link = Declare("color", Base("--cx-accent", theme.Accent));
        Hidden = mutedColor + "font-weight:400;font-size:11px;";
    }

    internal string Table { get; }

    internal string Caption { get; }

    internal string Header { get; }

    internal string Cell { get; }

    internal string Detail { get; }

    internal string DetailCaption { get; }

    internal string InnerTable { get; }

    internal string InnerHeader { get; }

    internal string PropertyName { get; }

    internal string InnerCell { get; }

    internal string Note { get; }

    internal string Link { get; }

    internal string Hidden { get; }

    /// <summary>The <c>color</c> declaration of a toned cell, or an empty string for a tone that keeps the normal colour.</summary>
    internal string ToneColor(CanopyTone tone) {
        if (tone.Name == null) {
            return string.Empty;
        }

        if (!_toneColors.TryGetValue(tone.Name, out var style)) {
            if (tone == CanopyTone.Neutral) {
                style = string.Empty;
            } else if (tone.IsBuiltIn) {
                style = Declare("color", BuiltIn(tone));
            } else {
                // A host tone takes the colour of the options and, with theme variables, the one the page defines; a
                // page that defines none leaves the normal text colour.
                var literal = HostColor(tone);
                style = (literal == null ? string.Empty : "color:" + literal + ";")
                    + (_variables ? "color:" + HostVariable(tone, literal ?? "inherit") + ";" : string.Empty);
            }

            _toneColors[tone.Name] = style;
        }

        return style;
    }

    /// <summary>The style of a badge: the tone's colour on the tint the runtime gives it, inside a line that keeps the pill visible where backgrounds are dropped.</summary>
    internal string Badge(CanopyTone tone) {
        var name = tone.Name ?? string.Empty;
        if (!_badges.TryGetValue(name, out var style)) {
            Ink text;
            Ink background;
            if (tone.Name == null || tone == CanopyTone.Neutral) {
                text = _text;
                background = _quiet;
            } else if (tone == CanopyTone.Muted) {
                text = _muted;
                background = _quiet;
            } else if (tone.IsBuiltIn) {
                text = BuiltIn(tone);
                background = Mix(text, 12, _surface);
            } else {
                var literal = HostColor(tone);
                text = new Ink(literal ?? _text.Literal, _variables ? HostVariable(tone, literal ?? _text.Css!) : null);
                // The page can name the badge background of its tone; otherwise it is the tint of the tone's colour,
                // or of the text colour for a tone nobody gave one, as in the runtime.
                var tint = Mix(text, 12, _surface);
                background = new Ink(tint.Literal, _variables ? "var(--cx-tone-" + tone.Name + "-bg," + tint.Css + ")" : null);
            }

            style = BadgeShape + Border("border", _line) + Declare("background", background) + Declare("color", text);
            _badges[name] = style;
        }

        return style;
    }

    /// <summary>The colour of one of the five coloured tones CanopyX ships.</summary>
    private Ink BuiltIn(CanopyTone tone) {
        switch (tone.Name) {
            case "info":
                return Base("--cx-tone-info", _options.Theme.Info);
            case "success":
                return Base("--cx-tone-success", _options.Theme.Success);
            case "warning":
                return Base("--cx-tone-warning", _options.Theme.Warning);
            case "danger":
                return Base("--cx-tone-danger", _options.Theme.Danger);
            default:
                return _muted;
        }
    }

    /// <summary>The colour the options give a host tone, or null.</summary>
    /// <exception cref="InvalidOperationException">The colour is not a hex colour.</exception>
    private string? HostColor(CanopyTone tone) {
        if (!_options.ToneColors.TryGetValue(tone, out var color)) {
            return null;
        }

        // The value goes into an inline style.
        if (!CanopyStaticTheme.IsHexColor(color)) {
            throw new InvalidOperationException("The colour of tone '" + tone.Name + "' must be # followed by three or six hex digits.");
        }

        return color;
    }

    /// <summary>The theme's colour of a host tone, <c>--cx-tone-&lt;name&gt;</c> as the runtime reads it. A tone name is safe in a style.</summary>
    private static string HostVariable(CanopyTone tone, string fallback) => "var(--cx-tone-" + tone.Name + "," + fallback + ")";

    private Ink Base(string variable, string literal) => new Ink(literal, _variables ? "var(" + variable + "," + literal + ")" : null);

    /// <summary><c>color-mix(in srgb, a percent%, b)</c>, as a literal and, with theme variables, as that expression.</summary>
    private Ink Mix(Ink a, double percent, Ink b) => new Ink(
        "#" + Channel(a.Literal, b.Literal, 0, percent) + Channel(a.Literal, b.Literal, 1, percent) + Channel(a.Literal, b.Literal, 2, percent),
        _variables ? "color-mix(in srgb," + a.Css + " " + percent.ToString(CultureInfo.InvariantCulture) + "%," + b.Css + ")" : null);

    private static string Channel(string a, string b, int channel, double percent) =>
        ((int)Math.Round((Value(a, channel) * percent + Value(b, channel) * (100 - percent)) / 100.0, MidpointRounding.AwayFromZero)).ToString("x2", CultureInfo.InvariantCulture);

    /// <summary>One channel of <c>#rgb</c> or <c>#rrggbb</c>, from 0 to 255.</summary>
    private static int Value(string hex, int channel) => hex.Length == 4
        ? Convert.ToInt32(new string(hex[channel + 1], 2), 16)
        : Convert.ToInt32(hex.Substring(channel * 2 + 1, 2), 16);

    /// <summary>A declaration with the literal, then, with theme variables, the same property from the page's theme.</summary>
    private static string Declare(string property, Ink ink) =>
        property + ":" + ink.Literal + ";" + (ink.Css == null ? string.Empty : property + ":" + ink.Css + ";");

    private static string Border(string property, Ink ink) =>
        property + ":1px solid " + ink.Literal + ";" + (ink.Css == null ? string.Empty : property + "-color:" + ink.Css + ";");

    /// <summary>A colour as a hex literal and, with theme variables, as the CSS expression that follows the page's theme.</summary>
    private readonly struct Ink {
        internal Ink(string literal, string? css) {
            Literal = literal;
            Css = css;
        }

        internal string Literal { get; }

        internal string? Css { get; }
    }
}
