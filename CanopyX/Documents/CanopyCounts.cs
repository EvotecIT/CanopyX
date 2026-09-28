using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Counts and rollup values for several nodes: the <c>counts</c> document of the <c>canopyx/1</c> protocol. A live
/// host returns it so the page can refresh "3 changed below" style values without reloading rows.
/// </summary>
public sealed class CanopyCounts {
    /// <summary>Gets the entries, one per node.</summary>
    public IList<CanopyCountEntry> Items { get; } = new List<CanopyCountEntry>();

    /// <summary>Writes the <c>counts</c> document.</summary>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    public string ToJson() {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var writer = new CanopyJsonWriter(1024);
        writer.BeginObject().Envelope("counts").Name("items").BeginArray();
        foreach (var item in Items) {
            if (item != null && !ids.Add(item.Id)) {
                throw new InvalidOperationException("Counts cannot repeat node id '" + item.Id + "'.");
            }
            (item ?? throw new InvalidOperationException("Counts cannot contain a null entry.")).WriteJson(writer);
        }

        writer.EndArray().EndObject();
        return writer.ToString();
    }
}
