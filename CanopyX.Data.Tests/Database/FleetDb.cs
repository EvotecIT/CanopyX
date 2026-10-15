using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CanopyX.Data.Tests;

public sealed class FleetDb : DbContext {
    public FleetDb(DbContextOptions<FleetDb> options) : base(options) { }

    public DbSet<Host> Hosts => Set<Host>();
    public DbSet<Owner> Owners => Set<Owner>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        modelBuilder.Entity<Host>().HasOne(host => host.Owner).WithMany().HasForeignKey(host => host.OwnerId);
        modelBuilder.Entity<Host>().HasIndex(host => host.Name);
        modelBuilder.Entity<Host>().HasIndex(host => host.Site);
    }
}

/// <summary>Counts through EF Core's asynchronous operator.</summary>
public sealed class EfExecutor : CanopyQueryExecutor {
    public override Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) => query.CountAsync(cancellationToken);
}

/// <summary>A temporary SQLite database file seeded with the fleet fixture; deleted on dispose.</summary>
public sealed class SqliteFleet : IDisposable {
    public SqliteFleet(IReadOnlyList<Host> hosts) {
        Folder = Path.Combine(Path.GetTempPath(), "canopyx-data-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Folder);
        ConnectionString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(Folder, "fleet.db"), Pooling = false }.ToString();
        using var db = Create();
        db.Database.EnsureCreated();
        db.Owners.AddRange(hosts.Where(host => host.Owner != null).Select(host => host.Owner!).Distinct().Select(owner => new Owner { Id = owner.Id, Name = owner.Name }));
        db.SaveChanges();
        db.Hosts.AddRange(hosts.Select(host => new Host {
            Id = host.Id, Name = host.Name, Site = host.Site, Os = host.Os, Cores = host.Cores, Memory = host.Memory, Online = host.Online,
            LastSeen = host.LastSeen, OwnerId = host.Owner?.Id, Notes = host.Notes
        }));
        db.SaveChanges();
    }

    public string Folder { get; }
    public string ConnectionString { get; }
    public List<string> Sql { get; } = new List<string>();

    public FleetDb Create(bool log = false) {
        var options = new DbContextOptionsBuilder<FleetDb>().UseSqlite(ConnectionString);
        if (log) options.LogTo(message => { lock (Sql) Sql.Add(message); }, new[] { DbLoggerCategory.Database.Command.Name });
        return new FleetDb(options.Options);
    }

    public void Dispose() {
        SqliteConnection.ClearAllPools();
        try { Directory.Delete(Folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}
