namespace CanopyX.Data;

/// <summary>The outcome of a server check (<see cref="CanopyFlowCheckResult.Status"/>).</summary>
public enum CanopyFlowCheckStatus {
    /// <summary>The check passed.</summary>
    Pass,

    /// <summary>The check passed with a warning the reader may have to acknowledge.</summary>
    Warning,

    /// <summary>The check failed.</summary>
    Fail
}