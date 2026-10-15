using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A record's detail payload for a nested tree: the inline roots of the definition's <see cref="CanopyGridDetail.TreeView"/>.</summary>
/// <remarks>Grid detail rows are as tall as their content; <see cref="CanopyDetail.Height"/> does not apply to them.</remarks>
public sealed class CanopyTreeDetail : CanopyDetail {
    /// <summary>Gets the nested tree's top-level nodes, with their inline children.</summary>
    public IList<CanopyNode> Roots { get; } = new List<CanopyNode>();

    internal override string Type => "tree";

    internal override void WriteContent(CanopyJsonWriter writer) {
        writer.Name("roots").BeginArray();
        foreach (var root in Roots) {
            if (root == null) throw new InvalidOperationException("Nested detail roots cannot be null.");
            root.WriteJson(writer);
        }
        writer.EndArray();
    }
}
