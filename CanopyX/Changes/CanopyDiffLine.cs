using System;

namespace CanopyX;

/// <summary>One line of a text diff: its kind, its text without the line break and, when known, its line numbers.</summary>
public sealed class CanopyDiffLine {
    /// <summary>Creates a line.</summary>
    /// <param name="kind">Unchanged, removed or added.</param>
    /// <param name="text">The text without its line break; at most <see cref="CanopyTextDiff.MaxLineLength"/> characters.</param>
    /// <param name="beforeNumber">The line's one-based number in the earlier text, for unchanged and removed lines; used by <see cref="CanopyTextDiff.AddLines"/>.</param>
    /// <param name="afterNumber">The line's one-based number in the later text, for unchanged and added lines; used by <see cref="CanopyTextDiff.AddLines"/>.</param>
    /// <exception cref="ArgumentNullException"><paramref name="text"/> is null.</exception>
    public CanopyDiffLine(CanopyDiffLineKind kind, string text, int? beforeNumber = null, int? afterNumber = null) {
        Kind = kind;
        Text = text ?? throw new ArgumentNullException(nameof(text));
        BeforeNumber = beforeNumber;
        AfterNumber = afterNumber;
    }

    /// <summary>Gets whether the line is unchanged, removed or added.</summary>
    public CanopyDiffLineKind Kind { get; }

    /// <summary>Gets the text without its line break.</summary>
    public string Text { get; }

    /// <summary>Gets the line's number in the earlier text, when known. Lines read from a document get their numbers from their hunk.</summary>
    public int? BeforeNumber { get; internal set; }

    /// <summary>Gets the line's number in the later text, when known. Lines read from a document get their numbers from their hunk.</summary>
    public int? AfterNumber { get; internal set; }
}