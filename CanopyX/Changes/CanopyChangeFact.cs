using System;

namespace CanopyX;

/// <summary>
/// A fact about a change, shown in the item's details: one value (<see cref="After"/> alone), or the value before and after, such
/// as the owner or the signer. Values that differ are marked.
/// </summary>
public sealed class CanopyChangeFact {
    /// <summary>Creates a fact.</summary>
    /// <param name="label">What the value is, such as "Owner": plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> is null.</exception>
    public CanopyChangeFact(string label) => Label = label ?? throw new ArgumentNullException(nameof(label));

    /// <summary>Gets what the value is.</summary>
    public string Label { get; }

    /// <summary>Gets or sets the value before the change; at most 2,000 characters.</summary>
    public string? Before { get; set; }

    /// <summary>Gets or sets the value after the change, or the one value of a fact that did not change; at most 2,000 characters.</summary>
    public string? After { get; set; }

    /// <summary>Gets or sets the tone of the value, such as warning for "Not signed".</summary>
    public CanopyTone Tone { get; set; }
}