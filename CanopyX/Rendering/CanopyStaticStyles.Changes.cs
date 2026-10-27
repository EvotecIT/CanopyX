namespace CanopyX.Rendering;

internal sealed partial class CanopyStaticStyles {
    /// <summary>A comparison heading outside the table carries its own theme text as well as its surface.</summary>
    internal string ComparisonHeading => Caption + Declare("color", _text);

    /// <summary>Code: a monospace stack every mail client has.</summary>
    internal const string Mono = "font-family:Consolas,'Cascadia Mono','Courier New',monospace;";

    /// <summary>A diff line's background: a light tint of danger for removed lines and of success for added ones; none for unchanged lines.</summary>
    internal string DiffLine(CanopyDiffLineKind kind) => kind == CanopyDiffLineKind.Context ? string.Empty : Declare("background", Mix(DiffInk(kind), 9, _surface));

    /// <summary>A diff line's number and sign: muted, or on a changed line a darker grey on a stronger tint of the line's tone, so small digits stay readable.</summary>
    internal string DiffGutter(CanopyDiffLineKind kind) => kind == CanopyDiffLineKind.Context ? Declare("color", _muted)
        : Declare("color", Mix(_text, 78, _surface)) + Declare("background", Mix(DiffInk(kind), 16, _surface));

    /// <summary>The words that changed inside a changed line: a stronger tint, no underline or strike-through.</summary>
    internal string DiffMark(CanopyDiffLineKind kind) => "text-decoration:none;border-radius:2px;" + Declare("background", Mix(DiffInk(kind), 28, _surface)) + Declare("color", _text);

    /// <summary>A folded region: quiet text on the header's tint.</summary>
    internal string DiffGap => Declare("background", Mix(_text, 3.5, _surface)) + Declare("color", _muted) + "font-style:italic;";

    /// <summary>A tone's text colour, as the formatting part reads it.</summary>
    internal string ToneText(CanopyTone tone) => Declare("color", FormatInk(tone));

    /// <summary>A state with its word: as a matrix cell where it needs attention, else the word in a readable shade of the tone.</summary>
    internal string StateText(CanopyTone tone, bool attention) =>
        attention || tone.Name == null || tone == CanopyTone.Neutral || tone == CanopyTone.Muted ? MatrixTone(tone, attention) : Declare("color", Mix(FormatInk(tone), 85, _text));

    private Ink DiffInk(CanopyDiffLineKind kind) => BuiltIn(kind == CanopyDiffLineKind.Removed ? CanopyTone.Danger : CanopyTone.Success);
}
