using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A context action whose execution is supplied and authorized by the host.</summary>
public sealed class CanopyContextAction {
    /// <summary>Creates an action. The browser sends its identifier to the host's action hook.</summary>
    /// <param name="id">The identifier, unique among the view's context actions.</param>
    /// <param name="label">The accessible menu label.</param>
    /// <exception cref="ArgumentException">The identifier is invalid or the label is blank.</exception>
    public CanopyContextAction(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Action label is required.", nameof(label));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the identifier passed to the host.</summary>
    public string Id { get; }

    /// <summary>Gets the accessible menu label.</summary>
    public string Label { get; }

    internal void WriteJson(CanopyJsonWriter writer) =>
        writer.BeginObject().Property("id", Id).Property("label", Label).EndObject();
}
