using System;

namespace CanopyX;

/// <summary>
/// A further form of the equivalent command (<see cref="CanopyFlowCommand.Variants"/>), such as C# beside PowerShell: the review page
/// shows a tab with the label, and the host's <c>commands[id](values)</c> hook writes its text.
/// </summary>
public sealed class CanopyFlowCommandVariant {
    /// <summary>Creates a variant.</summary>
    /// <param name="id">The id the host's <c>commands</c> hook is keyed by: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="label">The tab's text, for example "C#": plain text of at most 60 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowCommandVariant(string id, string label) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A variant id");
        Label = label;
    }

    /// <summary>Gets the variant's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the tab's text. Plain text of at most 60 characters.</summary>
    public string Label { get; set; }
}