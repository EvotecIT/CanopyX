namespace CanopyX.Data;

/// <summary>
/// A writer that saves inserts (<see cref="CanopyCommitOperation.Insert"/> rows) as well as updates. The endpoint hands insert rows
/// only to a writer that implements this interface and answers <see cref="AcceptsInserts"/> with true; any other writer never
/// sees them, and they answer <see cref="CanopyCommitMessages.InsertRefused"/>.
/// </summary>
/// <remarks>A writer that accepts inserts must check <see cref="CanopyCommitRow.Operation"/> on every row: an insert's
/// <see cref="CanopyCommitRow.Id"/> is the client's temporary id (<c>new-1</c>), never a stored key, and it has no original values.
/// <see cref="CanopyQueryableWriter{T}"/> implements it.</remarks>
public interface ICanopyInsertWriter : ICanopyDataWriter {
    /// <summary>Gets whether the writer saves insert rows now.</summary>
    bool AcceptsInserts { get; }
}
