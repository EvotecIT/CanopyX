namespace CanopyX;

/// <summary>How a diff shows its two texts.</summary>
public enum CanopyDiffLayout {
    /// <summary>Side by side where the diff is at least 900 pixels wide, inline below that. The reader can switch.</summary>
    Auto = 0,

    /// <summary>One column: removed lines above the added lines that replace them.</summary>
    Inline,

    /// <summary>Two columns: the earlier text on the start side, the later text on the end side.</summary>
    Split
}