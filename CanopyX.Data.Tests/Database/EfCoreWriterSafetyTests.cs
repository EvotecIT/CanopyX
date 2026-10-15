using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The reference writer under concurrency, scope and store failures: lost updates, records outside the caller's
/// scope, failed commits and rollbacks, and members a commit must not write.</summary>
public sealed class EfCoreWriterSafetyTests : IDisposable {
    private readonly List<Host> _hosts = Fleet.Hosts(40, asciiOnly: true, seed: 43);
    private readonly SqliteFleet _sqlite;
    private int _revision = 5;

    public EfCoreWriterSafetyTests() { _sqlite = new SqliteFleet(_hosts); }

    public void Dispose() => _sqlite.Dispose();

    private (CanopyRemoteHandler Handler, FleetDb Db, InterferingStore Store) Handler(Action<CanopyQueryableWriterOptions<Host>>? configure = null) {
        var map = Fleet.Map(Fleet.EditableView());
        var db = _sqlite.Create();
        var store = new InterferingStore(new EfCoreWriteStore<Host>(db));
        var options = new CanopyQueryableWriterOptions<Host>();
        configure?.Invoke(options);
        var writer = new CanopyQueryableWriter<Host>(map, store, options);
        var provider = new CanopyQueryableProvider<Host>(() => db.Hosts, map, new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r" + _revision) });
        return (new CanopyRemoteHandler(map.Schema, provider, null, writer), db, store);
    }

    private static string Memory(Host host) => host.Memory.ToString("R", CultureInfo.InvariantCulture);

    private static string Commit(string revision, params Host[] hosts) =>
        "{\"view\":\"fleet\",\"revision\":\"" + revision + "\",\"rows\":[" + string.Join(",", hosts.Select(host =>
            "{\"id\":\"" + host.Id + "\",\"values\":{\"memory\":42},\"original\":{\"memory\":" + Memory(host) + "}}")) + "]}";

    private static string[] Statuses(string json) => JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray().Select(row => row.GetProperty("status").GetString()!).ToArray();

    private double Stored(int id) {
        using var db = _sqlite.Create();
        return db.Hosts.Single(host => host.Id == id).Memory;
    }

    private void OtherUser(int id, double memory) {
        using var other = _sqlite.Create();
        var record = other.Hosts.Single(host => host.Id == id);
        record.Memory = memory;
        other.SaveChanges();
    }

    [Fact]
    public async Task ChangesBetweenTheRevisionReadAndTheSave_AreConflicts_WithoutARevisionSource() {
        var host = _hosts[3];
        var (handler, db, store) = Handler();
        using (db) {
            // The endpoint read r5 and the batch says r5; another writer changes the row before the row's transaction starts.
            store.BeforeTransaction = () => OtherUser(host.Id, 1.5);
            var json = await handler.CommitAsync(Commit("r5", host));
            Assert.Equal(new[] { "conflict" }, Statuses(json));
            Assert.Equal(1.5, Stored(host.Id));
        }
    }

    [Fact]
    public async Task ChangesBetweenTheRevisionReadAndTheSave_AreConflicts_WithARevisionReadInTheTransaction() {
        var host = _hosts[4];
        var (handler, db, store) = Handler(options => options.Revision = _ => new ValueTask<string>("r" + _revision));
        using (db) {
            store.BeforeTransaction = () => { OtherUser(host.Id, 2.5); _revision++; };
            var json = await handler.CommitAsync(Commit("r5", host));
            Assert.Equal(new[] { "conflict" }, Statuses(json));
            Assert.Equal(2.5, Stored(host.Id));
        }
    }

    [Fact]
    public async Task RecordsOutsideTheScope_AreNotWritten() {
        var inside = _hosts.First(host => host.Site == "Oslo");
        var outside = _hosts.First(host => host.Site != "Oslo");
        var (handler, db, _) = Handler(options => options.Scope = () => _sqlite.Create().Hosts.Where(host => host.Site == "Oslo"));
        using (db) {
            var json = await handler.CommitAsync(Commit("r5", inside, outside));
            Assert.Equal(new[] { "saved", "conflict" }, Statuses(json));
            Assert.Equal("This record no longer exists.", JsonDocument.Parse(json).RootElement.GetProperty("rows")[1].GetProperty("error").GetString());
            Assert.Equal(42, Stored(inside.Id));
            Assert.Equal(outside.Memory, Stored(outside.Id));
        }
    }

    [Fact]
    public async Task AFailedBatchCommit_AnswersEveryRowAsNotSaved() {
        var failures = new List<Exception>();
        var (handler, db, store) = Handler(options => { options.Transaction = CanopyCommitTransaction.PerBatch; options.Failed = (_, error) => failures.Add(error); });
        using (db) {
            store.FailCommit = true;
            var json = await handler.CommitAsync(Commit("r5", _hosts[6], _hosts[7]));
            Assert.Equal(new[] { "error", "error" }, Statuses(json));
            Assert.All(JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray(), row => Assert.Equal("The row could not be saved.", row.GetProperty("error").GetString()));
            Assert.Single(failures);
            Assert.True(store.Discarded > 0);
            Assert.Equal(_hosts[6].Memory, Stored(_hosts[6].Id));
        }
    }

    [Fact]
    public async Task AFailedRollback_KeepsTheRowsAnswerAndForgetsItsChanges() {
        var failures = new List<Exception>();
        var (handler, db, store) = Handler(options => options.Failed = (_, error) => failures.Add(error));
        using (db) {
            store.FailRollback = true;
            var changed = _hosts[8];
            OtherUser(changed.Id, 9.25);
            var json = await handler.CommitAsync(Commit("r4", changed, _hosts[9]));
            Assert.Equal(new[] { "conflict", "saved" }, Statuses(json));
            Assert.Single(failures);
            Assert.Equal(1, store.Discarded);
            Assert.Equal(9.25, Stored(changed.Id));
            Assert.Equal(42, Stored(_hosts[9].Id));
        }
    }

    [Fact]
    public async Task APerBatchFailure_StopsTheBatch_WithoutTryingTheRest() {
        var saving = new List<string>();
        var (handler, db, _) = Handler(options => {
            options.Transaction = CanopyCommitTransaction.PerBatch;
            options.Saving = (context, _) => {
                saving.Add(context.Row.Id);
                return new ValueTask<string?>(context.Row.Id == _hosts[11].Id.ToString(CultureInfo.InvariantCulture) ? "Frozen." : null);
            };
        });
        using (db) {
            var json = await handler.CommitAsync(Commit("r5", _hosts[10], _hosts[11], _hosts[12]));
            Assert.Equal(new[] { "error", "error", "error" }, Statuses(json));
            var rows = JsonDocument.Parse(json).RootElement.GetProperty("rows");
            Assert.Equal("Not saved: another row of this batch could not be saved.", rows[0].GetProperty("error").GetString());
            Assert.Equal("Frozen.", rows[1].GetProperty("error").GetString());
            Assert.Equal("Not saved: another row of this batch could not be saved.", rows[2].GetProperty("error").GetString());
            Assert.Equal(2, saving.Count);
            Assert.Equal(_hosts[10].Memory, Stored(_hosts[10].Id));
        }
    }

    [Fact]
    public void KeysAndConcurrencyTokens_CannotBeEditable() {
        var view = new CanopyDataGridView("tokens", "Tokens") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("id", "Id") { Kind = CanopyColumnKind.Number, Editable = true });
        view.Columns.Add(new CanopyColumn("stamp", "Stamp") { Editable = true });
        var keyed = new CanopyColumnMap<Token>(view).Key(x => x.Id).Column("id", x => x.Id).Column("stamp", x => x.Stamp);
        Assert.Contains("record key", Assert.Throws<ArgumentException>(() => new CanopyQueryableWriter<Token>(keyed, new ListStore<Token>())).Message);
        view.Columns[0].Editable = false;
        var stamped = new CanopyColumnMap<Token>(view).Key(x => x.Id).Column("id", x => x.Id).Column("stamp", x => x.Stamp);
        Assert.Contains("concurrency token", Assert.Throws<ArgumentException>(() => new CanopyQueryableWriter<Token>(stamped, new ListStore<Token>())).Message);
    }

    [Fact]
    public async Task UnsignedMembers_TakeWholeNumbersInRange() {
        var view = new CanopyDataGridView("counters", "Counters") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("count", "Count") { Kind = CanopyColumnKind.Number, Editable = true });
        var map = new CanopyColumnMap<Token>(view).Key(x => x.Id).Column("count", x => x.Count);
        var records = new List<Token> { new Token { Id = 1 }, new Token { Id = 2 } };
        var store = new ListStore<Token>(records);
        var handler = new CanopyRemoteHandler(map.Schema, new CanopyInMemoryProvider<Token>(map.Schema, () => records, x => x.Id.ToString(CultureInfo.InvariantCulture),
            new Dictionary<string, Func<Token, object?>> { ["count"] = x => x.Count }), null, new CanopyQueryableWriter<Token>(map, store));
        var json = await handler.CommitAsync("{\"rows\":[{\"id\":\"1\",\"values\":{\"count\":7},\"original\":{\"count\":0}},{\"id\":\"2\",\"values\":{\"count\":-1},\"original\":{\"count\":0}}]}");
        Assert.Equal(new[] { "saved", "error" }, Statuses(json));
        Assert.Equal(7UL, records[0].Count);
        Assert.Equal(0UL, records[1].Count);
    }

    public sealed class Token {
        public int Id { get; set; }
        [ConcurrencyCheck] public string Stamp { get; set; } = "";
        public ulong Count { get; set; }
    }

    /// <summary>A store over a list: changes apply at once and transactions do nothing, enough for conversion checks.</summary>
    private sealed class ListStore<T> : ICanopyWriteStore<T> where T : class {
        private readonly List<T> _records;
        public ListStore(List<T>? records = null) { _records = records ?? new List<T>(); }
        public IQueryable<T> Records => _records.AsQueryable();
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) => new ValueTask<ICanopyWriteTransaction>(new Nothing());
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) => default;
        public void DiscardChanges() { }
        private sealed class Nothing : ICanopyWriteTransaction {
            public ValueTask CommitAsync(CancellationToken cancellationToken) => default;
            public ValueTask RollbackAsync(CancellationToken cancellationToken) => default;
            public ValueTask DisposeAsync() => default;
        }
    }

    /// <summary>Wraps a store to play another writer before a transaction starts, and to fail commits or rollbacks.</summary>
    private sealed class InterferingStore : ICanopyWriteStore<Host> {
        private readonly ICanopyWriteStore<Host> _inner;
        public InterferingStore(ICanopyWriteStore<Host> inner) { _inner = inner; }
        public Action? BeforeTransaction { get; set; }
        public bool FailCommit { get; set; }
        public bool FailRollback { get; set; }
        public int Discarded { get; private set; }
        public IQueryable<Host> Records => _inner.Records;
        public async ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) {
            var interfere = BeforeTransaction;
            BeforeTransaction = null;
            interfere?.Invoke();
            return new Transaction(await _inner.BeginTransactionAsync(cancellationToken), this);
        }
        public ValueTask SaveChangesAsync(CancellationToken cancellationToken) => _inner.SaveChangesAsync(cancellationToken);
        public void DiscardChanges() { Discarded++; _inner.DiscardChanges(); }
        private sealed class Transaction : ICanopyWriteTransaction {
            private readonly ICanopyWriteTransaction _inner;
            private readonly InterferingStore _store;
            public Transaction(ICanopyWriteTransaction inner, InterferingStore store) { _inner = inner; _store = store; }
            public ValueTask CommitAsync(CancellationToken cancellationToken) => _store.FailCommit ? throw new InvalidOperationException("disk full, password hunter2") : _inner.CommitAsync(cancellationToken);
            public async ValueTask RollbackAsync(CancellationToken cancellationToken) {
                await _inner.RollbackAsync(cancellationToken);
                if (_store.FailRollback) throw new InvalidOperationException("connection lost");
            }
            public ValueTask DisposeAsync() => _inner.DisposeAsync();
        }
    }
}
