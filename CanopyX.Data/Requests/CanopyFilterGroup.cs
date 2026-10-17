using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated group of filter nodes combined with AND (all) or OR (any).</summary>
public sealed class CanopyFilterGroup : CanopyFilterNode {
    /// <summary>Creates a group.</summary>
    /// <param name="junction">Whether all or any children must match.</param>
    /// <param name="children">The children; at least one.</param>
    public CanopyFilterGroup(CanopyGridFilterJunction junction, IEnumerable<CanopyFilterNode> children) {
        if (junction != CanopyGridFilterJunction.All && junction != CanopyGridFilterJunction.Any) throw new ArgumentOutOfRangeException(nameof(junction));
        var list = new List<CanopyFilterNode>();
        foreach (var child in children ?? throw new ArgumentNullException(nameof(children))) list.Add(child ?? throw new ArgumentException("Children cannot be null.", nameof(children)));
        if (list.Count == 0) throw new ArgumentException("A filter group needs at least one child.", nameof(children));
        Junction = junction;
        Children = new ReadOnlyCollection<CanopyFilterNode>(list);
    }

    /// <inheritdoc />
    public override CanopyFilterNodeKind Kind => CanopyFilterNodeKind.Group;

    /// <summary>Gets whether all or any children must match.</summary>
    public CanopyGridFilterJunction Junction { get; }

    /// <summary>Gets the children.</summary>
    public IReadOnlyList<CanopyFilterNode> Children { get; }
}
