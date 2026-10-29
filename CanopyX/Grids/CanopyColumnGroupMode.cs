namespace CanopyX;

/// <summary>How column-group definitions affect a grid's layout.</summary>
public enum CanopyColumnGroupMode {
    /// <summary>Keep group members adjacent and move, pin and resize them together.</summary>
    Semantic,
    /// <summary>Draw contiguous header bands over displayed members without changing column layout or interactions.</summary>
    Presentation
}
