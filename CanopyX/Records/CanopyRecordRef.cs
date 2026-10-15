using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A link from a value to another record: a record of the same view, or of another grid or tree on the page. The record
/// panel shows the value as a link that opens that record in the drawer, with Back to return.
/// </summary>
public sealed class CanopyRecordRef {
    /// <summary>Creates a link to a record.</summary>
    /// <param name="id">The stable identity of the linked record (a row or node id).</param>
    /// <param name="view">The id of the grid or tree that holds the record; null for the view the value belongs to.</param>
    /// <exception cref="ArgumentException">The id or view id is empty.</exception>
    public CanopyRecordRef(string id, string? view = null) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (view != null) CanopyIdentifiers.Require(view, nameof(view));
        Id = id;
        View = view;
    }

    /// <summary>Gets the linked record's identity.</summary>
    public string Id { get; }

    /// <summary>Gets the id of the grid or tree that holds the record, or null for the value's own view.</summary>
    public string? View { get; }

    /// <summary>Gets the id path from a top-level node to a tree record, ending with <see cref="Id"/>, so a tree can load and
    /// expand a node it has not loaded yet. Leave it empty for flat grids.</summary>
    public IList<string> Path { get; } = new List<string>();

    internal void Validate() {
        if (Path.Count > 256) throw new InvalidOperationException("A record link path has at most 256 ids.");
        foreach (var id in Path) CanopyIdentifiers.Require(id, nameof(Path));
        if (Path.Count > 0 && Path[Path.Count - 1] != Id) throw new InvalidOperationException("A record link path ends with the linked record.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        Validate();
        writer.BeginObject().Property("id", Id).OptionalProperty("view", View);
        if (Path.Count > 0) writer.StringArray("path", Path);
        writer.EndObject();
    }
}
