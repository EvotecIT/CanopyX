using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A labelled footer row over the accepted page or all matching records.</summary>
public sealed class CanopyGridFooter {
    /// <summary>Creates a footer row.</summary>
    /// <param name="id">Stable footer identity.</param>
    /// <param name="label">Plain text describing the row.</param>
    /// <param name="scope">Whether aggregates cover the accepted page or all matching records.</param>
    public CanopyGridFooter(string id, string label, CanopyGridFooterScope scope = CanopyGridFooterScope.All) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 512) throw new ArgumentException("A footer needs a label of 1 to 512 characters.", nameof(label));
        if (!Enum.IsDefined(typeof(CanopyGridFooterScope), scope)) throw new ArgumentOutOfRangeException(nameof(scope));
        Id = id; Label = label; Scope = scope;
    }

    /// <summary>Gets the stable footer identity.</summary>
    public string Id { get; }
    /// <summary>Gets the plain display label.</summary>
    public string Label { get; }
    /// <summary>Gets the records included in this footer.</summary>
    public CanopyGridFooterScope Scope { get; }
    /// <summary>Gets the aggregate descriptors; a column may show more than one labelled value.</summary>
    public IList<CanopyGridAggregate> Aggregates { get; } = new List<CanopyGridAggregate>();

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label).Property("scope", Scope == CanopyGridFooterScope.Page ? "page" : "all");
        writer.Name("aggregates").BeginArray();
        foreach (var aggregate in Aggregates) aggregate.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
