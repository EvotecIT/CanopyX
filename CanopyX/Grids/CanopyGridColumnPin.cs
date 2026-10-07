namespace CanopyX;

/// <summary>Requested placement of a flat-grid column while the center scrolls horizontally.</summary>
public enum CanopyGridColumnPin {
    /// <summary>The column scrolls with the center.</summary>
    None,
    /// <summary>The column belongs to the left group.</summary>
    Left,
    /// <summary>The column belongs to the right group.</summary>
    Right
}
