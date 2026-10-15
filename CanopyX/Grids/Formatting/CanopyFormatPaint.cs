using System.Collections.Generic;

namespace CanopyX;

/// <summary>The resolved formatting of one target (a cell or a row) after the rules that matched it.</summary>
internal sealed class CanopyFormatPaint {
    internal CanopyTone Tone;
    internal CanopyFormatEmphasis? Emphasis;
    internal string? Icon;
    internal string? Badge;
    internal string? Cue;
    internal string? ClassName;
    internal IDictionary<string, string>? Css;
    internal double? Bar;
    internal CanopyTone BarTone;
    internal bool BarValue = true;
    internal CanopyTone? ScaleFrom;
    internal CanopyTone? ScaleTo;
    internal double ScaleWeight;
    internal string? Band;
    internal string? Glyph;
    internal bool Details;
    internal readonly List<string> Rules = new List<string>();
    internal readonly List<string> Descriptions = new List<string>();

    /// <summary>Takes each aspect this target does not have yet: the first rule that sets an aspect wins it.</summary>
    internal void Absorb(CanopyFormatPaint paint) {
        if (Tone.Name == null && paint.Tone.Name != null) Tone = paint.Tone;
        Emphasis ??= paint.Emphasis;
        Icon ??= paint.Icon;
        Badge ??= paint.Badge;
        Cue ??= paint.Cue;
        ClassName ??= paint.ClassName;
        Css ??= paint.Css;
        if (!Bar.HasValue && paint.Bar.HasValue) { Bar = paint.Bar; BarTone = paint.BarTone; BarValue = paint.BarValue; }
        if (ScaleFrom == null && paint.ScaleFrom != null) { ScaleFrom = paint.ScaleFrom; ScaleTo = paint.ScaleTo; ScaleWeight = paint.ScaleWeight; }
        Band ??= paint.Band;
    }

    /// <summary>A target that only colours gets its tone's icon, unless it asked for none.</summary>
    internal CanopyFormatPaint Finish() {
        if (Icon == null && Tone.Name != null && Badge == null && Cue == null && !Bar.HasValue && ScaleFrom == null) Icon = CanopyFormatIcons.Automatic;
        Glyph = Icon == null ? null : CanopyFormatIcons.Glyph(Icon, Tone);
        return this;
    }
}
