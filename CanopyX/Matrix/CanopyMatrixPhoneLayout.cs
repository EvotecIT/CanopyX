namespace CanopyX;

/// <summary>How a matrix reads on a phone (640 pixels and narrower).</summary>
public enum CanopyMatrixPhoneLayout {
    /// <summary>The row headers stay pinned and the columns scroll sideways (the default).</summary>
    Scroll = 0,
    /// <summary>A card per row lists its totals and the cells that need attention.</summary>
    Cards
}
