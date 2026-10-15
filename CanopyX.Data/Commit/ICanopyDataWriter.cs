using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Saves the changed rows of a commit to a data store: the optional write side of a remote grid endpoint.</summary>
/// <remarks>
/// <para>
/// The endpoint parses the <c>gridCommit</c> document, rejects columns the view does not declare editable or the schema
/// does not allow, and checks every value against the column's kind and the view's validation before the writer sees the
/// batch; rows that fail come back as errors without reaching the writer. Authorization belongs to the host: endpoints
/// require a write policy of their own.
/// </para>
/// <para>
/// A writer executes each row independently, so one row's failure does not discard the others. For concurrency it compares
/// <see cref="CanopyCommitBatch.Revision"/> with its current revision and, where they differ, each row's
/// <see cref="CanopyCommitRow.Original"/> values with the stored ones: a row whose stored values differ is a
/// <see cref="CanopyCommitStatus.Conflict"/> and is not written. A writer that cannot compare rows may answer every row of a
/// stale batch with a conflict. The comparison must run in the same serializing transaction as the save. A writer changes
/// only records its caller may read: the endpoint authorizes the caller, the writer restricts the records.
/// <see cref="CanopyQueryableWriter{T}"/> is the reference writer over a column map.
/// </para>
/// </remarks>
public interface ICanopyDataWriter {
    /// <summary>Saves the rows of a validated batch.</summary>
    /// <param name="batch">The batch; its rows passed the endpoint's checks.</param>
    /// <param name="revision">The dataset revision the endpoint read when the batch arrived.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>One result per row handled, and the revision after the commit.</returns>
    ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken);
}
