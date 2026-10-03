using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A checked or unchecked intent at a complete node-id path.</summary>
/// <remarks>
/// In a hierarchical view the intent applies to the path's whole branch, including descendants that have not
/// loaded. A deeper intent overrides an ancestor. In an independent view it applies only to the named node.
/// These are presentation choices; the host governs any operation performed on the chosen data.
/// </remarks>
public sealed class CanopyCheckIntent {
    /// <summary>Creates an intent, copying the supplied path.</summary>
    /// <param name="path">The complete path from a root to the node.</param>
    /// <param name="isChecked">Whether the path is checked.</param>
    /// <exception cref="ArgumentNullException"><paramref name="path"/> is null.</exception>
    /// <exception cref="ArgumentException">The path is empty, repeats an id, or contains an invalid id.</exception>
    public CanopyCheckIntent(IEnumerable<string> path, bool isChecked) {
        if (path == null) throw new ArgumentNullException(nameof(path));
        var ids = path.ToArray();
        if (ids.Length == 0) throw new ArgumentException("A checking intent needs a complete node-id path.", nameof(path));
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in ids) {
            CanopyIdentifiers.Require(id, nameof(path));
            if (!seen.Add(id)) throw new ArgumentException("A checking path cannot repeat a node id.", nameof(path));
        }
        Path = Array.AsReadOnly(ids);
        IsChecked = isChecked;
    }

    /// <summary>Gets the copied, read-only node-id path.</summary>
    public IReadOnlyList<string> Path { get; }

    /// <summary>Gets whether the path is checked.</summary>
    public bool IsChecked { get; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("path").BeginArray();
        foreach (var id in Path) writer.String(id);
        writer.EndArray().Property("checked", IsChecked).EndObject();
    }
}
