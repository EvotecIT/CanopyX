namespace CanopyX.Data;

/// <summary>The kinds of filter expression nodes.</summary>
public enum CanopyFilterNodeKind {
    /// <summary>A <see cref="CanopyFilterGroup"/>: all or any of its children match.</summary>
    Group = 0,
    /// <summary>A <see cref="CanopyFilterCondition"/> on one column.</summary>
    Condition,
    /// <summary>A <see cref="CanopyFilterConstant"/> that always or never matches.</summary>
    Constant
}
