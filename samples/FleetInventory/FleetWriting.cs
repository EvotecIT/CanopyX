using System.Globalization;
using CanopyX;
using CanopyX.Data;
using CanopyX.Html;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FleetInventory;

/// <summary>The dataset revision: a counter in the database that every saved row increments inside its transaction.</summary>
public sealed class FleetRevision {
    private readonly string _connectionString;

    public FleetRevision(string connectionString) { _connectionString = connectionString; }

    /// <summary>Creates the counter table in a new or older sample database.</summary>
    public void Ensure() {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "CREATE TABLE IF NOT EXISTS FleetRevisions (Id INTEGER PRIMARY KEY, Value INTEGER NOT NULL); INSERT OR IGNORE INTO FleetRevisions (Id, Value) VALUES (1, 1);";
        command.ExecuteNonQuery();
    }

    /// <summary>Reads the committed revision, for example <c>r12</c>.</summary>
    public async ValueTask<string> ReadAsync(CancellationToken cancellationToken) {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Value FROM FleetRevisions WHERE Id = 1";
        var value = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        return "r" + value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Increments the revision on the context's connection, so it commits or rolls back with the row's transaction.</summary>
    public static Task IncrementAsync(FleetDb db, CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlRawAsync("UPDATE FleetRevisions SET Value = Value + 1 WHERE Id = 1", cancellationToken);
}

/// <summary>The EF Core adapter of CanopyX's reference writer: tracked records, transactions and saving over a DbContext.</summary>
public sealed class EfCoreWriteStore<T> : ICanopyWriteStore<T> where T : class {
    private readonly DbContext _db;

    public EfCoreWriteStore(DbContext db) { _db = db; }

    // The sample reads without tracking by default; the writer loads tracked records so saving writes them.
    public IQueryable<T> Records => _db.Set<T>().AsTracking();

    public async ValueTask<ICanopyWriteTransaction> BeginTransactionAsync(CancellationToken cancellationToken) =>
        new Transaction(await _db.Database.BeginTransactionAsync(cancellationToken));

    public async ValueTask SaveChangesAsync(CancellationToken cancellationToken) => await _db.SaveChangesAsync(cancellationToken);

    public void DiscardChanges() => _db.ChangeTracker.Clear();

    private sealed class Transaction : ICanopyWriteTransaction {
        private readonly IDbContextTransaction _transaction;
        public Transaction(IDbContextTransaction transaction) { _transaction = transaction; }
        public ValueTask CommitAsync(CancellationToken cancellationToken) => new(_transaction.CommitAsync(cancellationToken));
        public ValueTask RollbackAsync(CancellationToken cancellationToken) => new(_transaction.RollbackAsync(cancellationToken));
        public ValueTask DisposeAsync() => _transaction.DisposeAsync();
    }
}

/// <summary>The editable page's demonstration of a conflict: another user changes a machine behind the reader's back.</summary>
public static class FleetDemo {
    /// <summary>Changes the model, cores, memory and online state of a machine, as another user would, and the revision.</summary>
    public static async Task<bool> OtherUserAsync(FleetDb db, int id, CancellationToken cancellationToken) {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var machine = await db.Machines.AsTracking().SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (machine == null) return false;
        machine.Model = FleetGrid.Models[(Array.IndexOf(FleetGrid.Models, machine.Model) + 1) % FleetGrid.Models.Length];
        machine.Cores = machine.Cores is int cores && cores < 256 ? cores * 2 : 2;
        machine.MemoryGb = Math.Round(machine.MemoryGb + 8, 1);
        machine.Online = !machine.Online;
        await db.SaveChangesAsync(cancellationToken);
        await FleetRevision.IncrementAsync(db, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <summary>The note above the editable grid: how saving works and the button that plays the other user.</summary>
    public static string EditNote(CanopyTheme theme) => Style(theme) + """
<div class="fleet-note" role="region" aria-label="About this page">
<p>Edit cells (F2 or double-click), then <strong>Save</strong>: the server checks every value again and saves each machine on its own.
For a conflict, change a machine's memory, select its row, press the button, then save.</p>
<button type="button" class="fleet-button" id="fleet-other-user">Simulate another user's change</button>
<span class="fleet-status" id="fleet-status" role="status"></span>
</div>
<script>
document.getElementById("fleet-other-user").addEventListener("click", async () => {
  const host = document.querySelector("[data-canopyx-mounted]"), status = document.getElementById("fleet-status");
  const id = host && host.canopyx.getSelection()[0];
  if (!id) { status.textContent = "Select a machine's row first."; return; }
  const response = await fetch("/api/demo/other-user/" + encodeURIComponent(id), { method: "POST", headers: { "X-Fleet-Demo": "1" } });
  status.textContent = response.ok ? "Another user changed machine " + id + ". Save your change to see the conflict." : "The change failed (" + response.status + ").";
});
</script>
""";

    /// <summary>The note above the grouped grid.</summary>
    public static string GroupNote(CanopyTheme theme) => Style(theme) + """
<div class="fleet-note" role="region" aria-label="About this page">
<p>Grouped by site (busiest first) and operating system; each heading counts machines and models and sums memory.
Change the levels in the group bar or a column menu.</p>
</div>
""";

    private static string Style(CanopyTheme theme) {
        var dark = theme == CanopyTheme.Dark;
        return "<style>" +
            ".cx-main{display:flex;flex-direction:column;height:100vh;box-sizing:border-box}" +
            "body.cx-page>.cx-main>.cx-host{flex:1;min-height:0;height:auto}" +
            (dark ? "body.cx-page{background:#16181c;color:#f2f3f5}" : "body.cx-page{background:#ffffff;color:#16181c}") +
            ".fleet-note{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:12px 16px 0;font:14px/1.45 Calibri,Carlito,\"Segoe UI\",system-ui,sans-serif}" +
            ".fleet-note p{margin:0;flex:1 1 480px;max-width:110ch;color:" + (dark ? "#c9ccd1" : "#4a4e55") + "}" +
            ".fleet-button{font:inherit;min-height:32px;padding:0 12px;border-radius:6px;cursor:pointer;border:1px solid " + (dark ? "#8a8e95" : "#7c8088") + ";" +
            "background:" + (dark ? "#1f2226" : "#ffffff") + ";color:inherit}" +
            ".fleet-button:hover{background:" + (dark ? "#272a30" : "#f2f3f4") + "}" +
            ".fleet-button:focus-visible{outline:2px solid " + (dark ? "#37c9b8" : "#11776f") + ";outline-offset:2px}" +
            ".fleet-status{color:" + (dark ? "#c9ccd1" : "#4a4e55") + "}" +
            "@media (max-width:600px){.fleet-note{font-size:13px;padding:8px 12px 0;gap:6px 12px}.fleet-note p{flex-basis:100%}}" +
            "</style>";
    }
}
