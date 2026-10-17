namespace CanopyX.Data;

/// <summary>A filter node that always or never matches, produced when a value list drops the predicates of its own column.</summary>
public sealed class CanopyFilterConstant : CanopyFilterNode {
    private CanopyFilterConstant(bool value) { Value = value; }

    /// <summary>Gets the node that matches every record.</summary>
    public static CanopyFilterConstant True { get; } = new CanopyFilterConstant(true);

    /// <summary>Gets the node that matches no record.</summary>
    public static CanopyFilterConstant False { get; } = new CanopyFilterConstant(false);

    /// <inheritdoc />
    public override CanopyFilterNodeKind Kind => CanopyFilterNodeKind.Constant;

    /// <summary>Gets whether the node matches every record (true) or none (false).</summary>
    public bool Value { get; }
}
