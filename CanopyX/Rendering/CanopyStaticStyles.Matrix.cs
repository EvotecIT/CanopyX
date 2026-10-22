namespace CanopyX.Rendering;

internal sealed partial class CanopyStaticStyles {
    /// <summary>Asks print to keep the tints, which browsers drop by default to save ink; the symbols carry the state either way.</summary>
    internal const string PrintColors = "-webkit-print-color-adjust:exact;print-color-adjust:exact;";

    /// <summary>
    /// A state cell: a state that needs attention is a tint of its tone behind the tone's text, bold, as the browser fills it; any
    /// other state is its symbol in the tone's colour alone, so a healthy matrix stays quiet. Neutral and muted states stay muted.
    /// </summary>
    internal string MatrixTone(CanopyTone tone, bool attention) {
        if (tone.Name == null || tone == CanopyTone.Neutral || tone == CanopyTone.Muted) {
            return attention ? Declare("background", Mix(_text, 7, _surface)) + "font-weight:700;" : Declare("color", _muted);
        }

        var ink = FormatInk(tone);
        return attention
            ? Declare("background", Mix(ink, 14, _surface)) + Declare("color", Mix(ink, 85, _text)) + "font-weight:700;"
            : Declare("color", tone == CanopyTone.Success ? Mix(ink, 70, _surface) : ink);
    }

    /// <summary>A group heading row: the header's tint and weight, under a line, across the row.</summary>
    internal string GroupHeading => "text-align:left;font-weight:600;padding:5px 8px;" + Declare("background", Mix(_text, 3.5, _surface)) + Border("border-bottom", _line);

    /// <summary>Quiet text inside a cell, such as a group's count or a cell without data.</summary>
    internal string MutedText => "font-weight:400;" + Declare("color", _muted);

    /// <summary>The self cell of a square matrix: a faint fill, counted nowhere.</summary>
    internal string SelfCell => Declare("background", Mix(_text, 5, _surface));
}
