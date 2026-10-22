namespace CanopyX;

/// <summary>What a line of a text diff is.</summary>
public enum CanopyDiffLineKind {
    /// <summary>An unchanged line, the same on both sides.</summary>
    Context = 0,

    /// <summary>A line only the earlier text has.</summary>
    Removed,

    /// <summary>A line only the later text has.</summary>
    Added
}