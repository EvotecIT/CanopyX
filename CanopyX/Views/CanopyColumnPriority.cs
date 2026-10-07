namespace CanopyX;

/// <summary>How a flat-grid column gives way when the grid is narrower than its columns' content.</summary>
/// <remarks>
/// When space is short, normal and optional columns first shrink to their minimum (their header, or about eleven
/// characters for text), then optional columns hide (on phones normal columns hide too), and only then the grid
/// scrolls horizontally with its pinned columns in place. Hidden columns remain in the record drawer, exports and
/// the phone "+N" affordance.
/// </remarks>
public enum CanopyColumnPriority {
    /// <summary>Shrinks to its minimum before the grid scrolls; never hides on desktop, collapses into "+N" on phones.</summary>
    Normal,
    /// <summary>Never narrower than its measured content and never hidden by the layout. The identity column defaults to it.</summary>
    Essential,
    /// <summary>Shrinks, then hides before the grid scrolls.</summary>
    Optional
}
