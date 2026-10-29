using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An explicit source-to-target chain. The host supplies every step in reading order.</summary>
public sealed class CanopyPathChain {
    private string _label;

    /// <summary>Creates a chain with its own identity and heading.</summary>
    /// <param name="id">A case-sensitive identity unique among the path's chains, up to 256 characters.</param>
    /// <param name="label">The chain heading, up to 4,096 characters.</param>
    public CanopyPathChain(string id, string label) {
        CanopyPath.RequireText(id, nameof(id), 256);
        CanopyPath.RequireText(label, nameof(label), 4096);
        Id = id;
        _label = label;
    }

    /// <summary>Gets the chain identity, independent of its heading and record identities.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the host's chain heading.</summary>
    public string Label {
        get => _label;
        set { CanopyPath.RequireText(value, nameof(value), 4096); _label = value; }
    }

    /// <summary>Gets between one and 256 ordered steps, including repeated records when explicitly supplied.</summary>
    public IList<CanopyPathHop> Hops { get; } = new List<CanopyPathHop>();

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label).Name("hops").BeginArray();
        foreach (var hop in Hops) hop.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
