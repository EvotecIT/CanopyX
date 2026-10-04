namespace CanopyX;

/// <summary>Chooses how matching records are presented, independently of source fetch size.</summary>
public enum CanopyGridPresentation {
    /// <summary>Continuously scrolls the complete matching result through a bounded viewport.</summary>
    Continuous,
    /// <summary>Shows a bounded page of the same matching result, with page navigation controls.</summary>
    Paged
}
