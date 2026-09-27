using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One search result: the id path from a top-level node to the match, so the runtime can expand the tree to it
/// without knowing anything else about the data.
/// </summary>
public sealed class CanopySearchHit {
    /// <summary>Creates a search hit.</summary>
    /// <param name="path">Node ids from the top level down to and including the match.</param>
    /// <param name="label">The match's label, shown in the result list.</param>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty or contains an empty id, repeated id, or unpaired surrogate.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> is null.</exception>
    public CanopySearchHit(IEnumerable<string> path, string label) {
        var ids = (path ?? throw new ArgumentNullException(nameof(path))).ToArray();
        if (ids.Length == 0 || ids.Any(string.IsNullOrEmpty)) {
            throw new ArgumentException("A search hit needs a non-empty path of non-empty ids.", nameof(path));
        }
        if (ids.Distinct(StringComparer.Ordinal).Count() != ids.Length) {
            throw new ArgumentException("A search path cannot repeat a node id.", nameof(path));
        }

        foreach (var id in ids) CanopyIdentifiers.Require(id, nameof(path));
        Path = Array.AsReadOnly(ids);
        Label = label ?? throw new ArgumentNullException(nameof(label));
    }

    /// <summary>Gets the node ids from the top level down to and including the match.</summary>
    public IReadOnlyList<string> Path { get; }

    /// <summary>Gets the match's label.</summary>
    public string Label { get; }

    /// <summary>Gets or sets the match's host category, shown as a small tag in the result list.</summary>
    public string? Kind { get; set; }

    /// <summary>Gets or sets where the match lives, for example its parent labels, shown under the label.</summary>
    public string? Context { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().StringArray("path", Path).Property("label", Label);
        writer.OptionalProperty("kind", Kind);
        writer.OptionalProperty("context", Context);
        writer.EndObject();
    }
}
