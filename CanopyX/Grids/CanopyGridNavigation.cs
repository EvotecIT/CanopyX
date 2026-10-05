namespace CanopyX;

/// <summary>Describes the traversal contract a flat-grid source implements.</summary>
public enum CanopyGridNavigation {
    /// <summary>Known result counts and random access through ordered matching-row offsets.</summary>
    Offset,

    /// <summary>Host-provided next and previous cursors, with optional counts and no random page jumps.</summary>
    /// <remarks>Cursor sources require a hosted, paged view. The host governs cursor validity and dataset access.</remarks>
    Cursor
}
