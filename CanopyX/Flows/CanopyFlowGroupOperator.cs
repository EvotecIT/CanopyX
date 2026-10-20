namespace CanopyX;

/// <summary>How a flow condition group combines its conditions (<see cref="CanopyFlowCondition.GroupOperator"/>).</summary>
public enum CanopyFlowGroupOperator {
    /// <summary>Every condition holds (<c>and</c>).</summary>
    All,

    /// <summary>At least one condition holds (<c>or</c>).</summary>
    Any,

    /// <summary>No condition holds (<c>none</c>).</summary>
    None
}