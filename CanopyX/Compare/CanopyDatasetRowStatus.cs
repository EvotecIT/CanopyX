namespace CanopyX;

/// <summary>The relationship of one stable row identity across two dataset versions.</summary>
public enum CanopyDatasetRowStatus {
    /// <summary>The row occurs only in the later version.</summary>
    Added,
    /// <summary>The row occurs only in the earlier version.</summary>
    Removed,
    /// <summary>At least one compared cell differs.</summary>
    Changed,
    /// <summary>Every compared cell has the same presence, type and value.</summary>
    Unchanged
}
