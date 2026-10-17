using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CanopyX.Data.Tests;

/// <summary>The EF Core adapter of the reference writer, as docs/remote-dotnet.md shows it.</summary>
public sealed class EfCoreWriteStore<T> : ICanopyWriteStore<T> where T : class {
    private readonly DbContext _db;

    public EfCoreWriteStore(DbContext db) { _db = db; }

    public IQueryable<T> Records => _db.Set<T>().AsTracking();

    public async ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) =>
        new Transaction(await _db.Database.BeginTransactionAsync(cancellationToken));

    public async ValueTask SaveChangesAsync(CancellationToken cancellationToken) => await _db.SaveChangesAsync(cancellationToken);

    public void DiscardChanges() => _db.ChangeTracker.Clear();

    private sealed class Transaction : ICanopyWriteTransaction {
        private readonly IDbContextTransaction _transaction;
        public Transaction(IDbContextTransaction transaction) { _transaction = transaction; }
        public ValueTask CommitAsync(CancellationToken cancellationToken) => new ValueTask(_transaction.CommitAsync(cancellationToken));
        public ValueTask RollbackAsync(CancellationToken cancellationToken) => new ValueTask(_transaction.RollbackAsync(cancellationToken));
        public ValueTask DisposeAsync() => _transaction.DisposeAsync();
    }
}
