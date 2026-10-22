namespace CanopyX;

/// <summary>Where a change stands at one replica, or overall: each state has its own symbol and text, never colour alone.</summary>
public enum CanopyPropagationState {
    /// <summary>The replica has the change (a check).</summary>
    Converged = 0,

    /// <summary>The replica does not have the change yet, within the time it is allowed (a clock).</summary>
    Propagating,

    /// <summary>The replica still differs past the time it is allowed, or holds something else (a cross).</summary>
    Fault,

    /// <summary>There is no current proof either way, for example the replica was not reached (a question mark).</summary>
    Unknown
}