using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Inserts through the reference writer over EF Core and SQLite: new records, their keys, refusals, scope and batches.</summary>
public sealed class EfCoreInsertTests : IDisposable {
    private readonly List<Host> _hosts = Fleet.Hosts(30, asciiOnly: true, seed: 17);
    private readonly SqliteFleet _sqlite;

    public EfCoreInsertTests() { _sqlite = new SqliteFleet(_hosts); }

    public void Dispose() => _sqlite.Dispose();

    private (CanopyRemoteHandler Handler, FleetDb Db) Handler(Action<CanopyQueryableWriterOptions<Host>, FleetDb>? configure = null, Func<FleetDb, ICanopyWriteStore<Host>>? store = null) {
        var map = Fleet.Map(Fleet.EditableView());
        var db = _sqlite.Create();
        var options = new CanopyQueryableWriterOptions<Host> { NewRecord = _ => new Host { OwnerId = 1 } };
        configure?.Invoke(options, db);
        var writeStore = store?.Invoke(db) ?? new EfCoreWriteStore<Host>(db);
        var writer = new CanopyQueryableWriter<Host>(map, writeStore, options);
        var provider = new CanopyQueryableProvider<Host>(() => writeStore.Records, map, new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r1") });
        return (new CanopyRemoteHandler(map.Schema, provider, null, writer), db);
    }

    private static string Commit(params string[] rows) => "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":\"r1\",\"rows\":[" + string.Join(",", rows) + "]}";

    private static string Insert(string id, string values) => "{\"op\":\"insert\",\"id\":\"" + id + "\",\"values\":" + values + "}";

    private static JsonElement[] Rows(string json) => JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray().ToArray();

    private int Count() {
        using var db = _sqlite.Create();
        return db.Hosts.Count();
    }

    [Fact]
    public async Task Inserts_AddRecordsWithTheirValues_AndAnswerTheStoredKey() {
        var (handler, db) = Handler();
        using (db) {
            var json = await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\",\"cores\":12,\"online\":true,\"lastSeen\":\"2026-10-19T09:00:00Z\",\"notes\":\"x'); DROP TABLE Hosts; --\"}")));
            var row = Assert.Single(Rows(json));
            Assert.Equal("saved", row.GetProperty("status").GetString());
            var id = int.Parse(row.GetProperty("newId").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
            Assert.True(id > _hosts.Max(host => host.Id));
            Assert.Equal(12, row.GetProperty("cells").GetProperty("cores").GetInt32());
            using var check = _sqlite.Create();
            var stored = check.Hosts.AsNoTracking().Single(host => host.Id == id);
            Assert.Equal("host-new", stored.Name);
            Assert.Equal(12, stored.Cores);
            Assert.True(stored.Online);
            Assert.Equal(new DateTime(2026, 10, 19, 9, 0, 0), stored.LastSeen);
            Assert.Equal("x'); DROP TABLE Hosts; --", stored.Notes);
            // The owner comes from the host's factory, never from the client.
            Assert.Equal(1, stored.OwnerId);
        }
    }

    [Fact]
    public async Task Inserts_AreRefused_WithoutAFactory() {
        var (handler, db) = Handler((options, _) => options.NewRecord = null);
        using (db) {
            var before = Count();
            var row = Assert.Single(Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\"}")))));
            Assert.Equal("error", row.GetProperty("status").GetString());
            Assert.Equal("New rows cannot be added here.", row.GetProperty("error").GetString());
            Assert.Equal(before, Count());
        }
    }

    [Fact]
    public async Task Inserts_OutsideTheCallersScope_AreRolledBack() {
        var (handler, db) = Handler((options, context) => options.Scope = () => context.Hosts.Where(host => host.OwnerId == 2));
        using (db) {
            var before = Count();
            var row = Assert.Single(Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\"}")))));
            Assert.Equal("error", row.GetProperty("status").GetString());
            Assert.Equal("The row could not be saved.", row.GetProperty("error").GetString());
            Assert.False(row.TryGetProperty("newId", out _));
            Assert.Equal(before, Count());
        }
        // A factory that puts the record in the scope saves it.
        var (allowed, allowedDb) = Handler((options, context) => { options.Scope = () => context.Hosts.Where(host => host.OwnerId == 2); options.NewRecord = _ => new Host { OwnerId = 2 }; });
        using (allowedDb) {
            Assert.Equal("saved", Assert.Single(Rows(await allowed.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\"}"))))).GetProperty("status").GetString());
        }
    }

    [Theory]
    [InlineData(CanopyCommitTransaction.PerRow)]
    [InlineData(CanopyCommitTransaction.PerBatch)]
    public async Task Inserts_RespectFilteredStoreRecordsWithoutAnAdditionalScope(CanopyCommitTransaction transaction) {
        var (handler, db) = Handler((options, _) => {
            options.Transaction = transaction;
            options.NewRecord = row => new Host { OwnerId = row.Id == "new-2" ? 1 : 2 };
        }, context => new ScopedInsertStore(context));
        using (db) {
            var rows = Rows(await handler.CommitAsync(Commit(
                Insert("new-1", "{\"name\":\"scope-first\"}"),
                Insert("new-2", "{\"name\":\"scope-deny\"}"),
                Insert("new-3", "{\"name\":\"scope-later\"}"))));
            // Query a fresh context so tracked state cannot masquerade as committed persistence.
            using var check = _sqlite.Create();
            var persisted = check.Hosts.AsNoTracking().Where(host => host.Name.StartsWith("scope-")).OrderBy(host => host.Id).ToList();
            var actual = string.Join(",", rows.Select(row => row.GetProperty("status").GetString())) + " | " + string.Join(",", persisted.Select(host => host.Name));
            Assert.Equal(transaction == CanopyCommitTransaction.PerRow ? "saved,error,saved | scope-first,scope-later" : "error,error,error | ", actual);
            Assert.False(rows[1].TryGetProperty("newId", out _));
            Assert.All(persisted, host => Assert.Equal(2, host.OwnerId));
            Assert.Equal(_hosts.Count + (transaction == CanopyCommitTransaction.PerRow ? 2 : 0), check.Hosts.Count());
        }
    }

    private sealed class ScopedInsertStore : ICanopyInsertStore<Host> {
        private readonly FleetDb _db;
        private readonly EfCoreWriteStore<Host> _inner;
        internal ScopedInsertStore(FleetDb db) { _db = db; _inner = new EfCoreWriteStore<Host>(db); }
        public IQueryable<Host> Records => _db.Hosts.Where(host => host.OwnerId == 2).AsTracking();
        public ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken token) => _inner.BeginTransactionAsync(token);
        public ValueTask SaveChangesAsync(CancellationToken token) => _inner.SaveChangesAsync(token);
        public void DiscardChanges() => _inner.DiscardChanges();
        public void Add(Host record) => _inner.Add(record);
    }

    [Fact]
    public async Task Inserts_RunTheSavingStep_AndARefusalKeepsNothing() {
        var seen = new List<CanopyCommitOperation>();
        var (handler, db) = Handler((options, _) => options.Saving = (context, _) => {
            seen.Add(context.Row.Operation);
            return new ValueTask<string?>(context.Record.Name == "refused" ? "Not today." : null);
        });
        using (db) {
            var before = Count();
            var rows = Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"refused\"}"), Insert("new-2", "{\"name\":\"kept\"}"))));
            Assert.Equal("Not today.", rows[0].GetProperty("error").GetString());
            Assert.Equal("saved", rows[1].GetProperty("status").GetString());
            Assert.Equal(new[] { CanopyCommitOperation.Insert, CanopyCommitOperation.Insert }, seen);
            Assert.Equal(before + 1, Count());
        }
    }

    [Fact]
    public async Task PerBatchCommits_KeepNoInsert_WhenAnotherRowFails() {
        var (handler, db) = Handler((options, _) => { options.Transaction = CanopyCommitTransaction.PerBatch; options.AlwaysCompareOriginals = true; });
        using (db) {
            var before = Count();
            var host = _hosts[3];
            var rows = Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\"}"),
                "{\"id\":\"" + host.Id + "\",\"values\":{\"memory\":3},\"original\":{\"memory\":12345.5}}")));
            Assert.Equal("error", rows[0].GetProperty("status").GetString());
            Assert.Equal("conflict", rows[1].GetProperty("status").GetString());
            Assert.Equal(before, Count());
        }
    }

    [Fact]
    public async Task PerRowCommits_KeepAnInsert_WhenALaterRowFails() {
        var (handler, db) = Handler((options, _) => options.AlwaysCompareOriginals = true);
        using (db) {
            var before = Count();
            var host = _hosts[3];
            var rows = Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\"}"),
                "{\"id\":\"" + host.Id + "\",\"values\":{\"memory\":3},\"original\":{\"memory\":12345.5}}")));
            Assert.Equal("saved", rows[0].GetProperty("status").GetString());
            Assert.Equal("conflict", rows[1].GetProperty("status").GetString());
            Assert.Equal(before + 1, Count());
        }
    }

    [Fact]
    public async Task Inserts_ThatAMemberCannotHold_AnswerCellErrors() {
        var (handler, db) = Handler();
        using (db) {
            var before = Count();
            // The view allows a fraction for memory but "os" must be an enumeration member.
            var row = Assert.Single(Rows(await handler.CommitAsync(Commit(Insert("new-1", "{\"name\":\"host-new\",\"os\":\"Plan9\"}")))));
            Assert.Equal("error", row.GetProperty("status").GetString());
            Assert.True(row.GetProperty("errors").TryGetProperty("os", out _));
            Assert.Equal(before, Count());
        }
    }
}
