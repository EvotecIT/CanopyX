using System;

namespace CanopyX;

/// <summary>One replica in a propagation view, such as a server or domain controller: its state, when the change was first and last seen there, and a note.</summary>
public sealed class CanopyPropagationWitness {
    /// <summary>Creates a replica.</summary>
    /// <param name="id">Its identity in the view.</param>
    /// <param name="label">Its name: plain text of at most 200 characters.</param>
    /// <param name="state">Where the change stands there.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> is null.</exception>
    public CanopyPropagationWitness(string id, string label, CanopyPropagationState state) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label ?? throw new ArgumentNullException(nameof(label));
        State = state;
    }

    /// <summary>Gets the replica's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets its name.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets a short line under the name, such as its site; at most 200 characters.</summary>
    public string? Secondary { get; set; }

    /// <summary>Gets or sets where the change stands there.</summary>
    public CanopyPropagationState State { get; set; }

    /// <summary>Gets or sets when the change was first seen there; null when it has not been.</summary>
    public DateTimeOffset? FirstSeen { get; set; }

    /// <summary>Gets or sets when the replica last reported, with or without the change.</summary>
    public DateTimeOffset? LastSeen { get; set; }

    /// <summary>Gets or sets a plain note, such as "Hash matches" or "Not reached since 10:20"; at most 500 characters.</summary>
    public string? Note { get; set; }

    /// <summary>Gets or sets whether the change was first seen here: the replica the others take it from.</summary>
    public bool Source { get; set; }

    /// <summary>Gets or sets the group the replica belongs to, such as its site; replicas with a group show under its heading.</summary>
    public string? Group { get; set; }
}