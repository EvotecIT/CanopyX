namespace CanopyX;

/// <summary>Whether a check gates its step (<see cref="CanopyFlowCheck.Requirement"/>).</summary>
public enum CanopyFlowCheckRequirement {
    /// <summary>Advisory: the reader may run it; it never blocks Next.</summary>
    None,

    /// <summary>Next is blocked until the check passes on the current answers; Next runs it when it has not.</summary>
    Pass,

    /// <summary>The check must have run on the current answers and not failed; a warning must be acknowledged.</summary>
    Run
}