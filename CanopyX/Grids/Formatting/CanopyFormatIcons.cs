using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// The icon names a formatting style can use. Each draws a text glyph in the tone's colour, so it prints and survives
/// forced colours. A style can also give up to four characters of its own.
/// </summary>
public static class CanopyFormatIcons {
    /// <summary>The tone's shape: a cross for danger, a warning sign, a check for success, an information sign, a dot otherwise. The default for a style that only colours.</summary>
    public const string Automatic = "auto";
    /// <summary>No icon, even for a style that only colours. Give the rule a cue, a badge or the legend instead.</summary>
    public const string None = "none";
    /// <summary>An upward arrow.</summary>
    public const string Up = "up";
    /// <summary>A downward arrow.</summary>
    public const string Down = "down";
    /// <summary>A check mark.</summary>
    public const string Check = "check";
    /// <summary>A cross.</summary>
    public const string Cross = "cross";
    /// <summary>A warning sign.</summary>
    public const string Warning = "warning";
    /// <summary>An information sign.</summary>
    public const string Info = "info";
    /// <summary>A filled dot.</summary>
    public const string Dot = "dot";
    /// <summary>A ring.</summary>
    public const string Circle = "circle";
    /// <summary>A triangle.</summary>
    public const string Triangle = "triangle";
    /// <summary>A square.</summary>
    public const string Square = "square";
    /// <summary>A diamond.</summary>
    public const string Diamond = "diamond";
    /// <summary>A flag.</summary>
    public const string Flag = "flag";
    /// <summary>A star.</summary>
    public const string Star = "star";
    /// <summary>A minus sign.</summary>
    public const string Minus = "minus";
    /// <summary>A plus sign.</summary>
    public const string Plus = "plus";
    /// <summary>A clock.</summary>
    public const string Clock = "clock";

    internal static readonly IReadOnlyDictionary<string, string> Glyphs = new Dictionary<string, string>(StringComparer.Ordinal) {
        [Up] = "↑", [Down] = "↓", [Check] = "✓", [Cross] = "✕", [Warning] = "⚠︎", [Info] = "ⓘ", [Dot] = "●", [Circle] = "○", [Triangle] = "▲",
        [Square] = "■", [Diamond] = "◆", [Flag] = "⚑", [Star] = "★", [Minus] = "−", [Plus] = "+", [Clock] = "◷"
    };

    /// <summary>The glyph of an icon for a tone, or null for none.</summary>
    internal static string? Glyph(string? icon, CanopyTone tone) {
        if (icon == None) return null;
        if (icon == null || icon == Automatic) icon = tone.Name == "danger" ? Cross : tone.Name == "warning" ? Warning : tone.Name == "success" ? Check : tone.Name == "info" ? Info : Dot;
        return Glyphs.TryGetValue(icon, out var glyph) ? glyph : icon;
    }

    internal static void Validate(string? icon) {
        if (icon == null || icon == Automatic || icon == None || Glyphs.ContainsKey(icon)) return;
        var points = 0;
        foreach (var unit in icon) if (!char.IsLowSurrogate(unit)) points++;
        if (string.IsNullOrWhiteSpace(icon) || points > 4 || icon.IndexOfAny(new[] { '<', '>' }) >= 0) throw new InvalidOperationException("An icon is a known name or up to four characters.");
        foreach (var unit in icon) if (char.IsControl(unit)) throw new InvalidOperationException("An icon cannot contain control characters.");
    }
}
