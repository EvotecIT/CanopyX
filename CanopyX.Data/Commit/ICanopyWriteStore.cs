using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>The unit of work <see cref="CanopyQueryableWriter{T}"/> writes through: tracked records, transactions and saving.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// CanopyX takes no dependency on a data access library; a host adapts its own. For EF Core the adapter is a few lines
/// over a <c>DbContext</c> (see docs/remote-dotnet.md):
/// <code>
/// sealed class EfCoreWriteStore&lt;T&gt;(DbContext db) : ICanopyWriteStore&lt;T&gt; where T : class {
///     public IQueryable&lt;T&gt; Records =&gt; db.Set&lt;T&gt;().AsTracking();
///     public async ValueTask&lt;ICanopyWriteTransaction&gt; BeginTransactionAsync(CancellationToken token) =&gt; new EfCoreTransaction(await db.Database.BeginTransactionAsync(token));
///     public async ValueTask SaveChangesAsync(CancellationToken token) =&gt; await db.SaveChangesAsync(token);
///     public void DiscardChanges() =&gt; db.ChangeTracker.Clear();
/// }
/// </code>
/// </remarks>
public interface ICanopyWriteStore<T> where T : class {
    /// <summary>Gets the records the writer loads by key; changes to loaded records must be tracked, so saving writes them.</summary>
    IQueryable<T> Records { get; }

    /// <summary>Starts a transaction around one row, or around the whole batch (<see cref="CanopyCommitTransaction"/>).</summary>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The transaction.</returns>
    ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken);

    /// <summary>Writes the tracked changes inside the current transaction.</summary>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>A task that completes when the changes are written.</returns>
    ValueTask SaveChangesAsync(CancellationToken cancellationToken);

    /// <summary>Forgets every unsaved change, after a row (or batch) that is not saved, so the next save cannot write it.</summary>
    void DiscardChanges();
}
