namespace CanopyX.Data;

/// <summary>How <see cref="CanopyQueryableWriter{T}"/> wraps a commit in store transactions.</summary>
public enum CanopyCommitTransaction {
    /// <summary>One transaction per row: each row is saved or not on its own, as the protocol expects. The default.</summary>
    PerRow = 0,
    /// <summary>One transaction for the batch, all or nothing: when any row conflicts or fails, no row is written and the rows
    /// that would have been saved answer with <see cref="CanopyCommitMessages.BatchNotSaved"/>.</summary>
    PerBatch
}
