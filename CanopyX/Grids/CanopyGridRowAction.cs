namespace CanopyX;

/// <summary>What a plain click on a flat-grid row does. A plain click never selects; selection uses Space, row checkboxes or the API.</summary>
public enum CanopyGridRowAction {
    /// <summary>The click focuses the row and does nothing else. Double-click and Enter still open the record details.</summary>
    None,
    /// <summary>The click opens the record details (the host details hook, or the built-in drawer).</summary>
    Details,
    /// <summary>The click follows the first link in the row, normally the identity column's link presenter, keeping Ctrl, Shift and Command.</summary>
    Link
}
