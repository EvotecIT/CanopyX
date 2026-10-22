using System;

namespace CanopyX;

/// <summary>A risk flag on a changed item, with the plain reason the reader sees, such as "Unsigned: the file has no embedded signature."</summary>
public sealed class CanopyChangeFlag {
    /// <summary>Creates a flag.</summary>
    /// <param name="id">The flag's identity within its item, such as <c>unsigned</c>.</param>
    /// <param name="label">The short label the chip shows: plain text of at most 64 characters.</param>
    /// <param name="reason">Why it is flagged: plain text of at most 500 characters.</param>
    /// <param name="tone">The tone; warning when none is given.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> or <paramref name="reason"/> is null.</exception>
    public CanopyChangeFlag(string id, string label, string reason, CanopyTone tone = default) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label ?? throw new ArgumentNullException(nameof(label));
        Reason = reason ?? throw new ArgumentNullException(nameof(reason));
        Tone = tone;
    }

    /// <summary>Gets the flag's identity within its item.</summary>
    public string Id { get; }

    /// <summary>Gets the short label.</summary>
    public string Label { get; }

    /// <summary>Gets why it is flagged.</summary>
    public string Reason { get; }

    /// <summary>Gets the tone; <see cref="CanopyTone.None"/> shows as warning.</summary>
    public CanopyTone Tone { get; }
}