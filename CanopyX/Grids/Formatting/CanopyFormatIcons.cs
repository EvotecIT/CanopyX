using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// The icon names a formatting style can use. Each draws a text glyph in the tone's colour, so it prints and survives
/// forced colours. A style can also give up to four characters of its own (<see cref="CanopyFormatStyle.Mark"/>).
/// </summary>
public static class CanopyFormatIcons {
    /// <summary>The tone's shape: a cross for danger, a warning sign, a check for success, an information sign, a dot otherwise. The default for a style that only colours.</summary>
    public static Icon Automatic { get; } = Icon.Named("auto");
    /// <summary>No icon, even for a style that only colours. Give the rule a cue, a badge or the legend instead.</summary>
    public static Icon None { get; } = Icon.Named("none");
    /// <summary>An upward arrow.</summary>
    public static Icon Up { get; } = Icon.Named("up");
    /// <summary>A downward arrow.</summary>
    public static Icon Down { get; } = Icon.Named("down");
    /// <summary>A check mark.</summary>
    public static Icon Check { get; } = Icon.Named("check");
    /// <summary>A cross.</summary>
    public static Icon Cross { get; } = Icon.Named("cross");
    /// <summary>A warning sign.</summary>
    public static Icon Warning { get; } = Icon.Named("warning");
    /// <summary>An information sign.</summary>
    public static Icon Info { get; } = Icon.Named("info");
    /// <summary>A filled dot.</summary>
    public static Icon Dot { get; } = Icon.Named("dot");
    /// <summary>A ring.</summary>
    public static Icon Circle { get; } = Icon.Named("circle");
    /// <summary>A triangle.</summary>
    public static Icon Triangle { get; } = Icon.Named("triangle");
    /// <summary>A square.</summary>
    public static Icon Square { get; } = Icon.Named("square");
    /// <summary>A diamond.</summary>
    public static Icon Diamond { get; } = Icon.Named("diamond");
    /// <summary>A flag.</summary>
    public static Icon Flag { get; } = Icon.Named("flag");
    /// <summary>A star.</summary>
    public static Icon Star { get; } = Icon.Named("star");
    /// <summary>A minus sign.</summary>
    public static Icon Minus { get; } = Icon.Named("minus");
    /// <summary>A plus sign.</summary>
    public static Icon Plus { get; } = Icon.Named("plus");
    /// <summary>A clock.</summary>
    public static Icon Clock { get; } = Icon.Named("clock");

    internal static readonly IReadOnlyDictionary<string, string> Glyphs = new Dictionary<string, string>(StringComparer.Ordinal) {
        ["up"] = "↑", ["down"] = "↓", ["check"] = "✓", ["cross"] = "✕", ["warning"] = "⚠︎", ["info"] = "ⓘ", ["dot"] = "●", ["circle"] = "○", ["triangle"] = "▲",
        ["square"] = "■", ["diamond"] = "◆", ["flag"] = "⚑", ["star"] = "★", ["minus"] = "−", ["plus"] = "+", ["clock"] = "◷"
    };

    /// <summary>The wire token of an icon or a mark: the mark's characters, the icon's key, or null for automatic.</summary>
    internal static string? Token(Icon icon, string? mark) => mark ?? (icon.IsEmpty ? null : icon.Key);

    /// <summary>The glyph of a token for a tone, or null for none.</summary>
    internal static string? Glyph(string? token, Tone tone) {
        if (token == "none") return null;
        if (token == null || token == "auto") token = tone == Tone.Danger ? "cross" : tone == Tone.Warning ? "warning" : tone == Tone.Success ? "check" : tone == Tone.Info ? "info" : "dot";
        return Glyphs.TryGetValue(token, out var glyph) ? glyph : token;
    }

    /// <summary>Checks a style's icon and mark: a known icon, or up to four characters of the style's own, not both.</summary>
    internal static void Validate(Icon icon, string? mark) {
        if (!icon.IsEmpty && mark != null) throw new InvalidOperationException("A style has an icon or a mark, not both.");
        if (!icon.IsEmpty && icon.Key != "auto" && icon.Key != "none" && !Glyphs.ContainsKey(icon.Key)) throw new InvalidOperationException("Icon '" + icon.Key + "' is not a formatting icon; use a CanopyFormatIcons icon, or Mark for characters of the style's own.");
        if (mark == null) return;
        var points = 0;
        foreach (var unit in mark) if (!char.IsLowSurrogate(unit)) points++;
        if (string.IsNullOrWhiteSpace(mark) || points > 4 || mark.IndexOfAny(new[] { '<', '>' }) >= 0) throw new InvalidOperationException("A mark is up to four characters.");
        foreach (var unit in mark) if (char.IsControl(unit)) throw new InvalidOperationException("A mark cannot contain control characters.");
    }
}
