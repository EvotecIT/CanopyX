namespace CanopyX;

/// <summary>Controls checking independently of the view's row selection.</summary>
public enum CanopyCheckboxMode {
    /// <summary>Shows no checkboxes.</summary>
    None,

    /// <summary>Checks each node independently, without changing its descendants.</summary>
    Independent,

    /// <summary>Checks branches, including unloaded descendants, with explicit exceptions and mixed ancestors.</summary>
    Hierarchical
}
