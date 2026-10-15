namespace CanopyX.Data;

/// <summary>A node of a validated filter expression: a group, a condition or a constant.</summary>
/// <remarks>Providers translate the tree by switching on <see cref="Kind"/>. Every condition references an allowed column.</remarks>
public abstract class CanopyFilterNode {
    private protected CanopyFilterNode() { }

    /// <summary>Gets what this node is.</summary>
    public abstract CanopyFilterNodeKind Kind { get; }
}
