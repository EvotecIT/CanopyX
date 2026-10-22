namespace CanopyX;

/// <summary>
/// How many rows the user can select at once.
/// </summary>
public enum CanopySelectionMode {
    /// <summary>One row at a time. Selection follows Enter, Space, or a click, not focus.</summary>
    Single = 0,

    /// <summary>Several rows, with Ctrl or Cmd to toggle, Shift to extend, and Space to toggle the focused row.</summary>
    Multiple,

    /// <summary>No row selection. Row activation, keyboard navigation and record drawers remain available.</summary>
    None
}
