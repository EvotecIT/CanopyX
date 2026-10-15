using System;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>A store transaction <see cref="CanopyQueryableWriter{T}"/> commits or rolls back; disposing an open one rolls it back.</summary>
public interface ICanopyWriteTransaction : IAsyncDisposable {
    /// <summary>Commits the transaction.</summary>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>A task that completes when the transaction is committed.</returns>
    ValueTask CommitAsync(CancellationToken cancellationToken);

    /// <summary>Rolls the transaction back.</summary>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>A task that completes when the transaction is rolled back.</returns>
    ValueTask RollbackAsync(CancellationToken cancellationToken);
}
