using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A short pill shown next to a label or a cell value, for example a count ("3 changed") or a state ("stale").
/// </summary>
public sealed class CanopyBadge {
    /// <summary>Creates a badge with the <see cref="CanopyTone.Neutral"/> tone.</summary>
    /// <param name="text">The text shown in the badge.</param>
    /// <exception cref="ArgumentException"><paramref name="text"/> is null or empty.</exception>
    public CanopyBadge(string text) : this(text, CanopyTone.Neutral) {
    }

    /// <summary>
    /// Creates a badge.
    /// </summary>
    /// <param name="text">The text shown in the badge.</param>
    /// <param name="tone">The semantic colour of the badge.</param>
    /// <exception cref="ArgumentException"><paramref name="text"/> is null or empty.</exception>
    public CanopyBadge(string text, CanopyTone tone) {
        if (string.IsNullOrEmpty(text)) {
            throw new ArgumentException("Badge text is required.", nameof(text));
        }

        Text = text;
        Tone = tone;
    }

    /// <summary>Gets the text shown in the badge.</summary>
    public string Text { get; }

    /// <summary>Gets or sets the semantic colour of the badge.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets an optional tooltip that explains the badge.</summary>
    public string? Title { get; set; }


    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("text", Text);
        writer.OptionalProperty("tone", Tone.Name);
        writer.OptionalProperty("title", Title);
        writer.EndObject();
    }
}
