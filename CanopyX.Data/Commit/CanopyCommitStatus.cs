namespace CanopyX.Data;

/// <summary>The outcome of one row of a commit.</summary>
public enum CanopyCommitStatus {
    /// <summary>The row was written; its canonical cells may replace the shown ones.</summary>
    Saved = 0,
    /// <summary>The row was not written: a value failed a check, or the store refused it. Messages explain why.</summary>
    Error,
    /// <summary>The row was not written because the stored record changed (or disappeared) since the reader loaded it.</summary>
    Conflict
}
