namespace CanopyX;

/// <summary>What a flat-grid column measures to find its content width.</summary>
public enum CanopyColumnAutoSize {
    /// <summary>The header and up to 200 loaded values, presenter-aware, capped at 420 pixels or the maximum width.</summary>
    Content,
    /// <summary>The header only; values that are wider are truncated with an ellipsis.</summary>
    Header,
    /// <summary>No measuring: the declared width is the column's content width.</summary>
    None
}
