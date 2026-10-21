namespace CanopyX.Data;

/// <summary>What a proposal says about a secret field (<see cref="CanopyFlowSubmission.Secrets"/>). Never its value.</summary>
public enum CanopyFlowSecretState {
    /// <summary>The reader typed a new value; read it once with <see cref="CanopyFlowSubmission.ReadSecret"/>.</summary>
    Set,

    /// <summary>The reader left it blank and the stored value stays.</summary>
    Keep,

    /// <summary>The stored value is to be removed.</summary>
    Clear
}