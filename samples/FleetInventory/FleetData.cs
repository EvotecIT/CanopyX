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
}

public sealed class FleetDb : DbContext {
    public FleetDb(DbContextOptions<FleetDb> options) : base(options) { }

    public DbSet<Machine> Machines => Set<Machine>();
    public DbSet<Team> Teams => Set<Team>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        var machine = modelBuilder.Entity<Machine>();
        machine.HasOne(item => item.Team).WithMany().HasForeignKey(item => item.TeamId);
        // Indexes for the default order, the grouping column and common filters keep windows and counts cheap.
        machine.HasIndex(item => item.Name);
        machine.HasIndex(item => new { item.Site, item.Name });
        machine.HasIndex(item => item.Os);
        machine.HasIndex(item => item.LastSeen);
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
        if (db.Machines.Any()) return;
        var connection = (SqliteConnection)db.Database.GetDbConnection();
        connection.Open();
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
        insert.CommandText = "INSERT INTO Machines (Id, Name, Site, Os, Model, Cores, MemoryGb, Online, LastSeen, TeamId) " +
            "VALUES ($id, $name, $site, $os, $model, $cores, $memory, $online, $seen, $team)";
        var p = new[] { "$id", "$name", "$site", "$os", "$model", "$cores", "$memory", "$online", "$seen", "$team" }.Select(n => insert.Parameters.Add(new SqliteParameter { ParameterName = n })).ToArray();
        insert.Prepare();
        var random = new Random(2026);
        for (var i = 1; i <= rows; i++) {
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
        transaction.Commit();
    }
}

/// <summary>Counts with EF Core's asynchronous operator; enumeration is already asynchronous for EF queries.</summary>
public sealed class EfCoreExecutor : CanopyX.Data.CanopyQueryExecutor {
    public override Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) => query.CountAsync(cancellationToken);
}
