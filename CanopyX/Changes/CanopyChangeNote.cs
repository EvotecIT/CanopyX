using System;

namespace CanopyX;

/// <summary>A short note about a change that the lines cannot show, such as "Line endings changed from CRLF to LF".</summary>
public sealed class CanopyChangeNote {
    /// <summary>Creates a note.</summary>
    /// <param name="text">Plain text of at most 500 characters.</param>
    /// <param name="tone">Its tone; info when none is given.</param>
    /// <exception cref="ArgumentNullException"><paramref name="text"/> is null.</exception>
    public CanopyChangeNote(string text, Tone tone = default) {
        Text = text ?? throw new ArgumentNullException(nameof(text));
        Tone = tone;
    }

    /// <summary>Gets the text.</summary>
    public string Text { get; }

    /// <summary>Gets the tone; <see cref="Tone.None"/> shows as info.</summary>
    public Tone Tone { get; }
}