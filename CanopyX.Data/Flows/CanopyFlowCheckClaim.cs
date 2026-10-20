namespace CanopyX.Data;

/// <summary>
/// A check result as the browser reports it in a proposal (<see cref="CanopyFlowSubmission.Checks"/>). It is a claim, not proof:
/// a host that relies on a check runs it again on the submitted answers before applying them.
/// </summary>
public sealed class CanopyFlowCheckClaim {
    internal CanopyFlowCheckClaim(string checkId, CanopyFlowCheckStatus status, string? at) {
        CheckId = checkId;
        Status = status;
        At = at;
    }

    /// <summary>Gets the check's id.</summary>
    public string CheckId { get; }

    /// <summary>Gets the status the browser reports.</summary>
    public CanopyFlowCheckStatus Status { get; }

    /// <summary>Gets when the browser says the check ran, as ISO 8601 text, or null.</summary>
    public string? At { get; }
}