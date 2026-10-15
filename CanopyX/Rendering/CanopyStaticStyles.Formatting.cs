using System;
using System.Globalization;

namespace CanopyX.Rendering;

internal sealed partial class CanopyStaticStyles {
    /// <summary>A tone's colour as the formatting part reads it: the built-in tones, the muted and neutral text, or a host tone's.</summary>
    private Ink FormatInk(CanopyTone tone) {
        if (tone == CanopyTone.Neutral) return Mix(_text, 78, _surface);
        if (tone.IsBuiltIn) return BuiltIn(tone);
        var literal = HostColor(tone);
        return new Ink(literal ?? _muted.Literal, _variables ? HostVariable(tone, literal ?? _muted.Css!) : null);
    }

    /// <summary>The declarations of a formatted cell: a tint behind tone-coloured text, or the colour alone, and bold for strong.</summary>
    internal string FormatTone(CanopyTone tone, CanopyFormatEmphasis emphasis) {
        var ink = FormatInk(tone);
        var color = Declare("color", Mix(ink, 82, _text));
        return emphasis == CanopyFormatEmphasis.Text ? color : Declare("background", Mix(ink, 13, _surface)) + color + (emphasis == CanopyFormatEmphasis.Strong ? "font-weight:600;" : string.Empty);
    }

    /// <summary>The background of a formatted row: a light tint of the tone.</summary>
    internal string FormatRow(CanopyTone tone) => Declare("background", Mix(FormatInk(tone), 8, _surface));

    /// <summary>The accent of a formatted row's first cell, where email clients keep borders.</summary>
    internal string FormatAccent(CanopyTone tone) {
        var ink = FormatInk(tone);
        return "border-left:3px solid " + ink.Literal + ";" + (ink.Css == null ? string.Empty : "border-left-color:" + ink.Css + ";");
    }

    /// <summary>The background of a colour scale cell: the mix of two tones at a weight, tinted with the surface.</summary>
    internal string FormatScale(CanopyTone from, CanopyTone to, double weight) {
        var percent = Math.Round(Math.Max(0, Math.Min(1, weight)) * 100);
        return Declare("background", Mix(Mix(FormatInk(to), percent, FormatInk(from)), 18, _surface));
    }

    /// <summary>The colour of an icon in a tone.</summary>
    internal string FormatIcon(CanopyTone tone) => tone.Name == null ? "font-weight:700;margin-right:4px;" : "font-weight:700;margin-right:4px;" + Declare("color", FormatInk(tone));

    /// <summary>A data bar as two nested inline blocks, which email clients and print keep.</summary>
    internal string FormatBar(CanopyTone tone, double width) =>
        "<span style=\"display:inline-block;width:60px;height:8px;margin-right:6px;vertical-align:middle;border-radius:4px;overflow:hidden;" + Declare("background", Mix(_text, 9, _surface)) +
        "\"><span style=\"display:block;height:8px;width:" + (Math.Max(0, Math.Min(1, width)) * 100).ToString("0.#", CultureInfo.InvariantCulture) + "%;" + Declare("background", Mix(FormatInk(tone), 78, _surface)) + "\"></span></span>";

    /// <summary>A text cue's style: quiet, smaller text.</summary>
    internal string FormatCue => "margin-left:6px;font-size:11px;" + Declare("color", _muted);
}
