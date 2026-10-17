using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>The reference writer over EF Core and SQLite: saved, error and conflict rows, stale revisions, transactions and parameters.</summary>
public sealed class EfCoreCommitTests : IDisposable {
    private readonly List<Host> _hosts = Fleet.Hosts(60, asciiOnly: true, seed: 41);
    private readonly SqliteFleet _sqlite;
    private int _revision = 5;

    public EfCoreCommitTests() { _sqlite = new SqliteFleet(_hosts); }

    public void Dispose() => _sqlite.Dispose();

    private (CanopyRemoteHandler Handler, FleetDb Db) Handler(Action<CanopyQueryableWriterOptions<Host>>? configure = null, CanopyDataGridView? view = null, bool log = false) {
        var map = Fleet.Map(view ?? Fleet.EditableView());
        var db = _sqlite.Create(log);
        var options = new CanopyQueryableWriterOptions<Host> {
            Revision = _ => new ValueTask<string>("r" + _revision),
            // Every saved row changes the dataset revision, inside its transaction.
            Saving = (_, _) => { _revision++; return new ValueTask<string?>((string?)null); }
        };
        configure?.Invoke(options);
        var writer = new CanopyQueryableWriter<Host>(map, new EfCoreWriteStore<Host>(db), options);
        var provider = new CanopyQueryableProvider<Host>(() => db.Hosts, map, new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r" + _revision) });
        return (new CanopyRemoteHandler(map.Schema, provider, null, writer), db);
    }

    private static string Commit(string revision, params string[] rows) =>
        "{\"protocol\":\"canopyx/2\",\"type\":\"gridCommit\",\"view\":\"fleet\",\"revision\":" + (revision == null ? "null" : "\"" + revision + "\"") + ",\"rows\":[" + string.Join(",", rows) + "]}";

    private static string Row(int id, string values, string original) => "{\"id\":\"" + id + "\",\"values\":" + values + ",\"original\":" + original + "}";

    private static JsonElement[] Rows(string json) => JsonDocument.Parse(json).RootElement.GetProperty("rows").EnumerateArray().ToArray();

    private Host Stored(int id) {
        using var db = _sqlite.Create();
        return db.Hosts.AsNoTracking().Single(host => host.Id == id);
    }

    [Fact]
    public async Task SavedRows_AreWrittenAndAnswerCanonicalCellsAndTheNewRevision() {
        var (handler, db) = Handler();
        using (db) {
            var host = _hosts[2];
            var json = await handler.CommitAsync(Commit("r5", Row(host.Id,
                "{\"cores\":16,\"online\":false,\"os\":\"MacOs\",\"lastSeen\":\"2026-03-04T05:06:07.250+01:00\",\"memory\":96.5,\"notes\":\"x'); DROP TABLE Hosts; --\"}",
                "{\"cores\":null,\"online\":null,\"os\":null,\"lastSeen\":null,\"memory\":null,\"notes\":null}")));
            var row = Assert.Single(Rows(json));
            Assert.Equal("saved", row.GetProperty("status").GetString());
            Assert.Equal(16, row.GetProperty("cells").GetProperty("cores").GetInt32());
            Assert.Equal("2026-03-04T04:06:07.250Z", row.GetProperty("cells").GetProperty("lastSeen").GetString());
            Assert.Equal("r6", JsonDocument.Parse(json).RootElement.GetProperty("revision").GetString());
            var stored = Stored(host.Id);
            Assert.Equal(16, stored.Cores);
            Assert.False(stored.Online);
            Assert.Equal(OsFamily.MacOs, stored.Os);
            Assert.Equal(96.5, stored.Memory);
            Assert.Equal(new DateTime(2026, 3, 4, 4, 6, 7, 250), stored.LastSeen);
            Assert.Equal("x'); DROP TABLE Hosts; --", stored.Notes);
        }
    }

    [Fact]
    public async Task StaleBatches_SaveRowsWhoseOriginalsMatch_AndRefuseRowsThatChanged() {
        var (handler, db) = Handler();
        using (db) {
            var same = _hosts[4];
            var changed = _hosts[5];
            // Someone else wrote row 6 after the reader loaded it.
            using (var other = _sqlite.Create()) {
                var record = other.Hosts.Single(host => host.Id == changed.Id);
                record.Memory = 1.25;
                other.SaveChanges();
            }
            _revision = 8;
            var json = await handler.CommitAsync(Commit("r5",
                Row(same.Id, "{\"memory\":10}", "{\"memory\":" + same.Memory.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "}"),
                Row(changed.Id, "{\"memory\":20}", "{\"memory\":" + changed.Memory.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "}")));
            var rows = Rows(json);
            Assert.Equal("saved", rows[0].GetProperty("status").GetString());
            Assert.Equal("conflict", rows[1].GetProperty("status").GetString());
            Assert.Equal("Someone else changed this row. Reload it and try again.", rows[1].GetProperty("error").GetString());
            Assert.Equal(10, Stored(same.Id).Memory);
            Assert.Equal(1.25, Stored(changed.Id).Memory);
            Assert.Equal("r9", JsonDocument.Parse(json).RootElement.GetProperty("revision").GetString());
        }
    }

    [Fact]
    public async Task CurrentRevision_SkipsTheComparison_UnlessEveryRowIsCompared() {
        var host = _hosts[7];
        var (handler, db) = Handler();
        using (db) {
            var json = await handler.CommitAsync(Commit("r5", Row(host.Id, "{\"memory\":3}", "{\"memory\":999}")));
            Assert.Equal("saved", Rows(json)[0].GetProperty("status").GetString());
        }
        var (strict, strictDb) = Handler(options => options.AlwaysCompareOriginals = true);
        using (strictDb) {
            var json = await strict.CommitAsync(Commit("r6", Row(host.Id, "{\"memory\":4}", "{\"memory\":999}")));
            Assert.Equal("conflict", Rows(json)[0].GetProperty("status").GetString());
            Assert.Equal(3, Stored(host.Id).Memory);
        }
    }

    [Fact]
    public async Task MissingRecordsAndNullRevisions_AreConflictsWhenTheStoreDiffers() {
        var (handler, db) = Handler();
        using (db) {
            var host = _hosts[9];
            var json = await handler.CommitAsync(Commit(null!, Row(9999, "{\"memory\":1}", "{\"memory\":2}"),
                Row(host.Id, "{\"memory\":5}", "{\"memory\":" + host.Memory.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "}")));
            var rows = Rows(json);
            Assert.Equal("conflict", rows[0].GetProperty("status").GetString());
            Assert.Equal("This record no longer exists.", rows[0].GetProperty("error").GetString());
            Assert.Equal("saved", rows[1].GetProperty("status").GetString());
        }
    }

    [Fact]
    public async Task ValuesTheMemberCannotHold_AreCellErrors() {
        var view = Fleet.EditableView();
        view.Columns.First(column => column.Id == "cores").Editor = null;
        var (handler, db) = Handler(view: view);
        using (db) {
            var host = _hosts[11];
            var json = await handler.CommitAsync(Commit("r5",
                Row(host.Id, "{\"cores\":2.5,\"os\":\"Plan9\"}", "{\"cores\":null,\"os\":null}"),
                Row(_hosts[12].Id, "{\"cores\":4294967296}", "{\"cores\":null}"),
                Row(_hosts[13].Id, "{\"online\":null}", "{\"online\":true}")));
            var rows = Rows(json);
            Assert.Equal("Cores must be a whole number in range.", rows[0].GetProperty("errors").GetProperty("cores").GetString());
            Assert.Equal("Choose Operating system from the list.", rows[0].GetProperty("errors").GetProperty("os").GetString());
            Assert.Equal("Cores must be a whole number in range.", rows[1].GetProperty("errors").GetProperty("cores").GetString());
            Assert.Equal("Online is required.", rows[2].GetProperty("errors").GetProperty("online").GetString());
            Assert.Equal(host.Cores, Stored(host.Id).Cores);
        }
    }

    [Fact]
    public async Task PerBatchTransactions_WriteNothingWhenARowFails() {
        var (handler, db) = Handler(options => options.Transaction = CanopyCommitTransaction.PerBatch);
        using (db) {
            var first = _hosts[14];
            var json = await handler.CommitAsync(Commit("r4",
                Row(first.Id, "{\"memory\":7}", "{\"memory\":" + first.Memory.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "}"),
                Row(_hosts[15].Id, "{\"memory\":8}", "{\"memory\":12345}")));
            var rows = Rows(json);
            Assert.Equal("error", rows[0].GetProperty("status").GetString());
            Assert.Equal("Not saved: another row of this batch could not be saved.", rows[0].GetProperty("error").GetString());
            Assert.Equal("conflict", rows[1].GetProperty("status").GetString());
            Assert.Equal(first.Memory, Stored(first.Id).Memory);
        }
    }

    [Fact]
    public async Task Failures_StopTheirRowOnly_WithoutLeakingTheirText() {
        var failures = new List<Exception>();
        var (handler, db) = Handler(options => {
            options.Saving = (context, _) => {
                if (context.Row.Id == _hosts[17].Id.ToString(System.Globalization.CultureInfo.InvariantCulture)) throw new InvalidOperationException("database password is hunter2");
                if (context.Row.Id == _hosts[18].Id.ToString(System.Globalization.CultureInfo.InvariantCulture)) throw new DbUpdateConcurrencyException("token changed");
                if (context.Row.Id == _hosts[19].Id.ToString(System.Globalization.CultureInfo.InvariantCulture)) return new ValueTask<string?>("Frozen during the audit.");
                _revision++;
                return new ValueTask<string?>((string?)null);
            };
            options.Failed = (_, error) => failures.Add(error);
        });
        using (db) {
            var json = await handler.CommitAsync(Commit("r5", new[] { 16, 17, 18, 19 }.Select(index => Row(_hosts[index].Id, "{\"memory\":42}",
                "{\"memory\":" + _hosts[index].Memory.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + "}")).ToArray()));
            var rows = Rows(json);
            Assert.Equal(new[] { "saved", "error", "conflict", "error" }, rows.Select(row => row.GetProperty("status").GetString()));
            Assert.Equal("The row could not be saved.", rows[1].GetProperty("error").GetString());
            Assert.Equal("Frozen during the audit.", rows[3].GetProperty("error").GetString());
            Assert.DoesNotContain("hunter2", json);
            Assert.Equal(2, failures.Count);
            Assert.Equal(42, Stored(_hosts[16].Id).Memory);
            Assert.Equal(_hosts[17].Memory, Stored(_hosts[17].Id).Memory);
            Assert.Equal(_hosts[19].Memory, Stored(_hosts[19].Id).Memory);
        }
    }

    [Fact]
    public async Task Values_ReachTheDatabaseOnlyAsParameters() {
        var (handler, db) = Handler(log: true);
        using (db) {
            const string hostile = "'); DELETE FROM Hosts; --";
            await handler.CommitAsync(Commit("r5", Row(_hosts[20].Id, "{\"notes\":" + RandomQueries.Json(hostile) + "}", "{\"notes\":null}")));
            var sql = string.Join("\n", _sqlite.Sql);
            Assert.Contains("UPDATE", sql);
            Assert.DoesNotContain("DELETE FROM", sql);
            Assert.Equal(hostile, Stored(_hosts[20].Id).Notes);
            Assert.Equal(_hosts.Count, db.Hosts.Count());
        }
    }

    [Fact]
    public void EditableColumnsThatAreNotMembers_CannotBeWritten() {
        var view = Fleet.EditableView();
        view.Columns.First(column => column.Id == "owner").Editable = true;
        using var db = _sqlite.Create();
        var error = Assert.Throws<ArgumentException>(() => new CanopyQueryableWriter<Host>(Fleet.Map(view), new EfCoreWriteStore<Host>(db)));
        Assert.Contains("owner", error.Message);
    }
}
