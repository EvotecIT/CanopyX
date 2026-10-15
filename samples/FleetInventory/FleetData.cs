using System.Runtime.Serialization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace FleetInventory;

/// <summary>Display names come from <see cref="EnumMemberAttribute"/>; the grid filters, sorts and lists values by them.</summary>
public enum OperatingSystemFamily {
    Windows,
    Linux,
    [EnumMember(Value = "macOS")] MacOs,
    [EnumMember(Value = "FreeBSD")] FreeBsd
}

public sealed class Team {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public sealed class Machine {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Site { get; set; }
    public OperatingSystemFamily Os { get; set; }
    public string Model { get; set; } = string.Empty;
    public int? Cores { get; set; }
    public double MemoryGb { get; set; }
    public bool Online { get; set; }
    public DateTime? LastSeen { get; set; }
    public int? TeamId { get; set; }
    public Team? Team { get; set; }
    // Record details: read only when a machine's drawer opens.
    public string SerialNumber { get; set; } = string.Empty;
    public DateTime? PurchasedOn { get; set; }
    public string? Notes { get; set; }
    public int? RackId { get; set; }
    public Rack? Rack { get; set; }
    public int? ReplacesId { get; set; }
    public Machine? Replaces { get; set; }
    public List<InstalledSoftware> Software { get; set; } = new List<InstalledSoftware>();
    public List<MaintenanceEvent> Maintenance { get; set; } = new List<MaintenanceEvent>();
    public List<ConfigurationChange> Changes { get; set; } = new List<ConfigurationChange>();
}

public sealed class FleetDb : DbContext {
    public FleetDb(DbContextOptions<FleetDb> options) : base(options) { }

    public DbSet<Machine> Machines => Set<Machine>();
    public DbSet<Team> Teams => Set<Team>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        var machine = modelBuilder.Entity<Machine>();
        machine.HasOne(item => item.Team).WithMany().HasForeignKey(item => item.TeamId);
        // Indexes for the default order, the grouping columns and common filters keep windows and counts cheap.
        machine.HasIndex(item => item.Name);
        machine.HasIndex(item => new { item.Site, item.Name });
        machine.HasIndex(item => new { item.Site, item.Os, item.Name });
        machine.HasIndex(item => item.Os);
        machine.HasIndex(item => item.LastSeen);
        // Record details hang off the machine; each child table is read by machine and its own order, through these indexes.
        machine.HasOne(item => item.Rack).WithMany(rack => rack.Machines).HasForeignKey(item => item.RackId);
        machine.HasOne(item => item.Replaces).WithMany().HasForeignKey(item => item.ReplacesId);
        machine.HasMany(item => item.Software).WithOne().HasForeignKey(item => item.MachineId);
        machine.HasMany(item => item.Maintenance).WithOne().HasForeignKey(item => item.MachineId);
        machine.HasMany(item => item.Changes).WithOne().HasForeignKey(item => item.MachineId);
        machine.HasIndex(item => new { item.RackId, item.Name });
        modelBuilder.Entity<Rack>().ToTable("Racks");
        modelBuilder.Entity<InstalledSoftware>().ToTable("InstalledSoftware").HasIndex(item => new { item.MachineId, item.Name });
        modelBuilder.Entity<MaintenanceEvent>().ToTable("MaintenanceEvents").HasIndex(item => new { item.MachineId, item.At });
        modelBuilder.Entity<ConfigurationChange>().ToTable("ConfigurationChanges").HasIndex(item => new { item.MachineId, item.At });
    }
}

/// <summary>Creates and seeds the sample database with deterministic rows, using one prepared insert inside a transaction.</summary>
public static class FleetSeed {
    private static readonly string?[] Sites = { "Amsterdam", "Austin", "Berlin", "Singapore", "São Paulo", "Sydney", "Toronto", "Warsaw", null };
    private static readonly string[] Models = { "Rack 1U", "Rack 2U", "Blade", "Tower", "Mini PC", "Laptop", "Virtual machine" };
    private static readonly string[] Teams = { "Platform", "Data", "Payments", "Identity", "Edge", "Research", "Support" };
    private static readonly DateTime Now = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

    public static void Ensure(FleetDb db, int rows) {
        db.Database.EnsureCreated();
        var connection = (SqliteConnection)db.Database.GetDbConnection();
        connection.Open();
        // EnsureCreated leaves a database that has tables alone. One without the record details is an earlier sample database,
        // which the sample rebuilds, or not a sample database at all, which it refuses to touch.
        var tables = new List<string>();
        using (var probe = connection.CreateCommand()) {
            probe.CommandText = "SELECT name FROM sqlite_master WHERE type = 'table'";
            using var reader = probe.ExecuteReader();
            while (reader.Read()) tables.Add(reader.GetString(0));
        }
        if (!tables.Contains("InstalledSoftware")) {
            var earlier = tables.Contains("Machines") && tables.Contains("Teams") && tables.All(name => name is "Machines" or "Teams" or "FleetRevisions" or "sqlite_sequence");
            if (!earlier) throw new InvalidOperationException("The database file is not a fleet sample database; choose another --database path.");
            Console.WriteLine("The sample database predates record details; rebuilding it.");
            connection.Close();
            SqliteConnection.ClearPool(connection);
            db.Database.EnsureDeleted();
            db.Database.EnsureCreated();
            connection.Open();
        }
        if (db.Machines.Any()) return;
        using var transaction = connection.BeginTransaction();
        using (var team = connection.CreateCommand()) {
            team.Transaction = transaction;
            team.CommandText = "INSERT INTO Teams (Id, Name) VALUES ($id, $name)";
            var id = team.Parameters.Add("$id", SqliteType.Integer);
            var name = team.Parameters.Add("$name", SqliteType.Text);
            for (var i = 0; i < Teams.Length; i++) { id.Value = i + 1; name.Value = Teams[i]; team.ExecuteNonQuery(); }
        }
        using var insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText = "INSERT INTO Machines (Id, Name, Site, Os, Model, Cores, MemoryGb, Online, LastSeen, TeamId, SerialNumber, PurchasedOn, Notes, RackId, ReplacesId) " +
            "VALUES ($id, $name, $site, $os, $model, $cores, $memory, $online, $seen, $team, $serial, $purchased, $notes, $rack, $replaces)";
        var p = new[] { "$id", "$name", "$site", "$os", "$model", "$cores", "$memory", "$online", "$seen", "$team", "$serial", "$purchased", "$notes", "$rack", "$replaces" }
            .Select(n => insert.Parameters.Add(new SqliteParameter { ParameterName = n })).ToArray();
        insert.Prepare();
        // Racks first: machines refer to them. Details come from a sequence of their own, so the grid columns keep earlier values.
        FleetDetailsSeed.InsertRacks(connection, transaction, rows);
        var random = new Random(2026);
        var details = new Random(77);
        for (var i = 1; i <= rows; i++) {
            var (serial, purchased, notes, rack, replaces) = FleetDetailsSeed.Machine(details, i, Now);
            p[10].Value = serial; p[11].Value = purchased; p[12].Value = (object?)notes ?? DBNull.Value;
            p[13].Value = (object?)rack ?? DBNull.Value; p[14].Value = (object?)replaces ?? DBNull.Value;
            var site = Sites[random.Next(Sites.Length)];
            var os = (OperatingSystemFamily)(random.Next(10) switch { < 5 => 1, < 8 => 0, 8 => 2, _ => 3 });
            p[0].Value = i;
            p[1].Value = (site == null ? "spare" : site.Substring(0, 3).ToLowerInvariant().Replace("ã", "a")) + "-" + os.ToString().ToLowerInvariant()[0] + i.ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
            p[2].Value = (object?)site ?? DBNull.Value;
            p[3].Value = (int)os;
            p[4].Value = Models[random.Next(Models.Length)];
            p[5].Value = random.Next(15) == 0 ? DBNull.Value : 1 << random.Next(1, 8);
            p[6].Value = Math.Round(Math.Pow(2, random.Next(2, 10)) * (0.75 + random.NextDouble() / 2), 1);
            p[7].Value = random.Next(9) != 0;
            p[8].Value = random.Next(25) == 0 ? DBNull.Value : Now.AddSeconds(-random.Next(0, 60 * 60 * 24 * 120)).ToString("yyyy-MM-dd HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture);
            p[9].Value = random.Next(12) == 0 ? DBNull.Value : random.Next(1, Teams.Length + 1);
            insert.ExecuteNonQuery();
        }
        FleetDetailsSeed.Insert(connection, transaction, rows, Now);
        transaction.Commit();
    }
}

/// <summary>Counts with EF Core's asynchronous operator; enumeration is already asynchronous for EF queries.</summary>
public sealed class EfCoreExecutor : CanopyX.Data.CanopyQueryExecutor {
    public override Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) => query.CountAsync(cancellationToken);
}
