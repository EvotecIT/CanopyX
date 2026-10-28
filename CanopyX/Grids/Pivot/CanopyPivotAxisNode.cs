using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>One row or column prefix in a pivot, including its complete raw path for drill-through.</summary>
public sealed class CanopyPivotAxisNode {
    internal CanopyPivotAxisNode(string key, string? parent, IReadOnlyList<CanopyCell?> path, bool other = false) {
        Key = key; Parent = parent; Path = path; Other = other;
    }
    /// <summary>Gets the stable typed path identity.</summary>
    public string Key { get; }
    /// <summary>Gets the parent identity, or null for the total.</summary>
    public string? Parent { get; }
    /// <summary>Gets the raw or bucketed axis values. The total and Other have no path.</summary>
    public IReadOnlyList<CanopyCell?> Path { get; }
    /// <summary>Gets whether this node combines the column paths outside the retained set.</summary>
    public bool Other { get; }
    /// <summary>Gets the depth, zero for a total and one for Other.</summary>
    public int Depth => Other ? 1 : Path.Count;
}
