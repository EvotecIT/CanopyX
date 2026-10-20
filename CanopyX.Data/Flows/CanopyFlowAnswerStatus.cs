namespace CanopyX.Data;

/// <summary>What the host answers a proposal (<see cref="CanopyFlowAnswer.Status"/>).</summary>
public enum CanopyFlowAnswerStatus {
    /// <summary>The change is applied; the flow shows its result panel.</summary>
    Saved,

    /// <summary>The change is accepted and runs on; the flow shows its progress panel.</summary>
    Accepted,

    /// <summary>The change was refused; the review page shows the message and the field and step messages.</summary>
    Error,

    /// <summary>The settings changed since the flow opened (another baseline); the review page offers to reload them.</summary>
    Conflict
}