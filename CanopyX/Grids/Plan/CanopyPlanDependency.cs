using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A finish-to-start dependency between two task record identities.</summary>
public sealed class CanopyPlanDependency {
    /// <summary>Creates a dependency: the successor starts after the predecessor finishes.</summary>
    /// <param name="predecessor">The predecessor's grid row identity.</param>
    /// <param name="successor">The successor's grid row identity.</param>
    public CanopyPlanDependency(string predecessor, string successor) {
        CanopyIdentifiers.Require(predecessor, nameof(predecessor));
        CanopyIdentifiers.Require(successor, nameof(successor));
        if (predecessor == successor) throw new ArgumentException("A task cannot depend on itself.", nameof(successor));
        Predecessor = predecessor;
        Successor = successor;
    }

    /// <summary>Gets the predecessor's grid row identity.</summary>
    public string Predecessor { get; }

    /// <summary>Gets the successor's grid row identity.</summary>
    public string Successor { get; }

    /// <summary>Gets or sets the nonnegative elapsed delay after the predecessor finishes. Defaults to zero.</summary>
    public TimeSpan Lag { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("predecessor", Predecessor).Property("successor", Successor);
        if (Lag != TimeSpan.Zero) writer.Name("lagMinutes").Number(Lag.TotalMinutes);
        writer.EndObject();
    }
}
