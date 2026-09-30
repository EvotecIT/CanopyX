namespace CanopyX.Bundles;

/// <summary>
/// One node in a bundle's search entry table. Entries are numbered in depth-first order, so a node's parent always has
/// a smaller number than the node, and the runtime rebuilds the id path and context by following parents.
/// </summary>
internal readonly struct CanopySearchEntry {
    internal CanopySearchEntry(int number, int parent, string id, string label, int kind) {
        Number = number;
        Parent = parent;
        Id = id;
        Label = label;
        Kind = kind;
    }

    /// <summary>Gets the entry number.</summary>
    internal int Number { get; }

    /// <summary>Gets the parent's entry number, or -1 for a top-level node.</summary>
    internal int Parent { get; }

    internal string Id { get; }

    internal string Label { get; }

    /// <summary>Gets the index of the node's kind in the index's kind table, or -1 when the node has no kind.</summary>
    internal int Kind { get; }
}
