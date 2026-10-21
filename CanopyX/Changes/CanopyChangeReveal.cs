namespace CanopyX;

/// <summary>What a change list action opens in the list itself, instead of raising an action for the host.</summary>
public enum CanopyChangeReveal {
    /// <summary>Nothing: the action copies, opens a link or is the host's.</summary>
    None = 0,

    /// <summary>The item's details: its flags, versions and facts (and diff).</summary>
    Details,

    /// <summary>The item's diff, opened and scrolled into view; an item without a diff does not offer the action.</summary>
    Diff
}