using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The store query is itself a write boundary, including when an inserted record falls outside it.</summary>
public sealed class InsertStoreScopeTests {
    [Theory]
    [InlineData(CanopyCommitTransaction.PerRow)]
    [InlineData(CanopyCommitTransaction.PerBatch)]
    public async Task Inserts_RespectFilteredStoreRecordsWithoutAnAdditionalScope(CanopyCommitTransaction transaction) {
        var store = new ScopedStore();
        var map = Fleet.Map(Fleet.EditableView());
        var writer = new CanopyQueryableWriter<Host>(map, store, new CanopyQueryableWriterOptions<Host> {
            Transaction = transaction,
            NewRecord = row => new Host { OwnerId = row.Id == "new-2" ? 1 : 2 }
        });
        var provider = new CanopyQueryableProvider<Host>(() => store.Records, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider, null, writer);
        var body = "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r1\",\"rows\":[" +
            "{\"op\":\"insert\",\"id\":\"new-1\",\"values\":{\"name\":\"scope-first\"}}," +
            "{\"op\":\"insert\",\"id\":\"new-2\",\"values\":{\"name\":\"scope-deny\"}}," +
            "{\"op\":\"insert\",\"id\":\"new-3\",\"values\":{\"name\":\"scope-later\"}}]}";
        using var response = JsonDocument.Parse(await handler.CommitAsync(body));
        var rows = response.RootElement.GetProperty("rows").EnumerateArray().ToList();
        var actual = string.Join(",", rows.Select(row => row.GetProperty("status").GetString())) + " | " + string.Join(",", store.Persisted.Select(host => host.Name));
        Assert.Equal(transaction == CanopyCommitTransaction.PerRow ? "saved,error,saved | scope-first,scope-later" : "error,error,error | ", actual);
        Assert.False(rows[1].TryGetProperty("newId", out _));
        Assert.All(store.Persisted, host => Assert.Equal(2, host.OwnerId));
        Assert.Equal(transaction == CanopyCommitTransaction.PerRow ? 1 : 0, store.Persisted.Count(host => host.Name == "scope-later"));
        Assert.Equal(1, store.Rollbacks);
    }

    [Fact]
    public async Task Updates_RespectBothStoreRecordsAndAnAdditionalScope() {
        var store = new ScopedStore(
            new Host { Id = 1, OwnerId = 1, Cores = 8, Name = "outside" },
            new Host { Id = 2, OwnerId = 2, Cores = 2, Name = "restricted" },
            new Host { Id = 3, OwnerId = 2, Cores = 8, Name = "allowed" });
        var map = Fleet.Map(Fleet.EditableView());
        var writer = new CanopyQueryableWriter<Host>(map, store, new CanopyQueryableWriterOptions<Host> {
            Scope = () => store.Persisted.Where(host => host.Cores == 8).AsQueryable()
        });
        var provider = new CanopyQueryableProvider<Host>(() => store.Records.Where(host => host.Cores == 8), map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider, null, writer);
        var body = "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r1\",\"rows\":[" +
            "{\"id\":\"1\",\"values\":{\"name\":\"changed\"},\"original\":{\"name\":\"outside\"}}," +
            "{\"id\":\"2\",\"values\":{\"name\":\"changed\"},\"original\":{\"name\":\"restricted\"}}," +
            "{\"id\":\"3\",\"values\":{\"name\":\"changed\"},\"original\":{\"name\":\"allowed\"}}]}";
        using var response = JsonDocument.Parse(await handler.CommitAsync(body));
        Assert.Equal(new[] { "conflict", "conflict", "saved" }, response.RootElement.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("status").GetString()));
        Assert.Equal(new[] { "outside", "restricted", "changed" }, store.Persisted.Select(host => host.Name));
    }

    /// <summary>A transactional in-memory unit of work; both frameworks execute the public writer against its filtered query.</summary>
    private sealed class ScopedStore : ICanopyInsertStore<Host> {
        private readonly List<Host> _stored = new List<Host>();
        private readonly List<Host> _pending = new List<Host>();
        internal ScopedStore(params Host[] records) { _stored.AddRange(records); }
        internal IReadOnlyList<Host> Persisted => _stored;
        internal int Rollbacks { get; private set; }
        public IQueryable<Host> Records => _stored.Where(host => host.OwnerId == 2).AsQueryable();
        public void Add(Host record) => _pending.Add(record);
        public ValueTask SaveChangesAsync(CancellationToken token) {
            foreach (var record in _pending) { record.Id = _stored.Count == 0 ? 1 : _stored.Max(host => host.Id) + 1; _stored.Add(record); }
            _pending.Clear();
            return default;
        }
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken token) => new ValueTask<ICanopyWriteTransaction>(new Transaction(this));
        public void DiscardChanges() => _pending.Clear();
        private sealed class Transaction : ICanopyWriteTransaction {
            private readonly ScopedStore _store;
            private readonly int _count;
            internal Transaction(ScopedStore store) { _store = store; _count = store._stored.Count; }
            public ValueTask CommitAsync(CancellationToken token) => default;
            public ValueTask RollbackAsync(CancellationToken token) {
                _store._stored.RemoveRange(_count, _store._stored.Count - _count);
                _store.Rollbacks++;
                return default;
            }
            public ValueTask DisposeAsync() => default;
        }
    }
}
