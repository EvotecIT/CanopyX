using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One host-ordered layer referring to a grid record, with the host's explanation and state.</summary>
public sealed class CanopyStackLayer {
    private string _reason;

    /// <summary>Creates a layer. Several layers may refer to the same record, but their layer ids must differ.</summary>
    /// <param name="id">The stable identity of this layer.</param>
    /// <param name="record">The stable id of an existing inline grid record.</param>
    /// <param name="reason">The host's nonblank explanation of this layer's result.</param>
    public CanopyStackLayer(string id, string record, string reason) {
        CanopyIdentifiers.Require(id, nameof(id));
        CanopyIdentifiers.Require(record, nameof(record));
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(record))
            throw new ArgumentException("Stack layer and record ids cannot be blank.");
        Id = id;
        Record = record;
        _reason = RequireReason(reason);
    }

    /// <summary>Gets this layer's stable identity, distinct from its record reference.</summary>
    public string Id { get; }

    /// <summary>Gets the stable grid record id opened by this layer.</summary>
    public string Record { get; }

    /// <summary>Gets or sets the host's nonblank explanation. CanopyX does not calculate precedence.</summary>
    public string Reason { get => _reason; set => _reason = RequireReason(value); }

    /// <summary>Gets or sets optional context displayed alongside the record title.</summary>
    public string? Label { get; set; }

    /// <summary>Gets or sets whether the host identifies this as the single winning layer.</summary>
    public bool Winner { get; set; }

    /// <summary>Gets or sets whether the host marks this layer as enforced. This does not select the winner.</summary>
    public bool Enforced { get; set; }

    /// <summary>Gets or sets whether the host marks this layer as filtered. A filtered layer cannot be the winner.</summary>
    public bool Filtered { get; set; }

    /// <summary>Gets the ordered badges supplied by the host, using the shared badge contract.</summary>
    public IList<CanopyBadge> Badges { get; } = new List<CanopyBadge>();

    private static string RequireReason(string reason) => string.IsNullOrWhiteSpace(reason)
        ? throw new ArgumentException("A stack layer reason is required.", nameof(reason)) : reason;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("record", Record).Property("reason", Reason).OptionalProperty("label", Label);
        if (Winner) writer.Property("winner", true);
        if (Enforced) writer.Property("enforced", true);
        if (Filtered) writer.Property("filtered", true);
        if (Badges.Count > 0) {
            writer.Name("badges").BeginArray();
            foreach (var badge in Badges) badge.WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
