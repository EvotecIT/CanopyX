using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CanopyX.Data.Tests;

public sealed class ScheduleDb : DbContext {
    public ScheduleDb(DbContextOptions<ScheduleDb> options) : base(options) { }

    public DbSet<Slot> Slots => Set<Slot>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        modelBuilder.Entity<Slot>().HasKey(slot => slot.Id);
        modelBuilder.Entity<Slot>().HasIndex(slot => slot.Starts);
    }
}

/// <summary>A temporary SQLite database file seeded with a schedule; deleted on dispose.</summary>
public sealed class SqliteSchedule : IDisposable {
    public SqliteSchedule(IReadOnlyList<Slot> slots) {
        Folder = Path.Combine(Path.GetTempPath(), "canopyx-range-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Folder);
        ConnectionString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(Folder, "schedule.db"), Pooling = false }.ToString();
        using var db = Create();
        db.Database.EnsureCreated();
        db.Slots.AddRange(slots.Select(slot => new Slot {
            Id = slot.Id, Title = slot.Title, Host = slot.Host, Kind = slot.Kind, Starts = slot.Starts, Ends = slot.Ends, Rule = slot.Rule,
            SeriesEnd = slot.SeriesEnd, Severity = slot.Severity, Notes = slot.Notes
        }));
        db.SaveChanges();
    }

    public string Folder { get; }
    public string ConnectionString { get; }
    public List<string> Sql { get; } = new List<string>();

    public ScheduleDb Create(bool log = false) {
        var options = new DbContextOptionsBuilder<ScheduleDb>().UseSqlite(ConnectionString);
        if (log) options.LogTo(message => { lock (Sql) Sql.Add(message); }, new[] { DbLoggerCategory.Database.Command.Name });
        return new ScheduleDb(options.Options);
    }

    public void Dispose() {
        SqliteConnection.ClearAllPools();
        try { Directory.Delete(Folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}
