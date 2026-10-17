using System;

namespace CanopyX.Data;

/// <summary>A row about to be saved by <see cref="CanopyQueryableWriter{T}"/>: the record with the new values applied, and the changed row.</summary>
/// <typeparam name="T">The record type.</typeparam>
public sealed class CanopyWriteContext<T> where T : class {
    internal CanopyWriteContext(T record, CanopyCommitRow row, CanopyCommitBatch batch) {
        Record = record ?? throw new ArgumentNullException(nameof(record));
        Row = row;
        Batch = batch;
    }

    /// <summary>Gets the tracked record, with the new values applied.</summary>
    public T Record { get; }

    /// <summary>Gets the changed row.</summary>
    public CanopyCommitRow Row { get; }

    /// <summary>Gets the batch the row belongs to.</summary>
    public CanopyCommitBatch Batch { get; }
}
