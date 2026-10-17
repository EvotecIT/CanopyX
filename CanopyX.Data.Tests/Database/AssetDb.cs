using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CanopyX.Data.Tests;

public sealed class AssetDb : DbContext {
    public AssetDb(DbContextOptions<AssetDb> options) : base(options) { }

    public DbSet<Asset> Assets => Set<Asset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) {
        var asset = modelBuilder.Entity<Asset>();
        asset.HasOne(item => item.Replaces).WithMany().HasForeignKey(item => item.ReplacesId);
        asset.HasOne(item => item.Group).WithMany(group => group.Members).HasForeignKey(item => item.GroupId);
        asset.HasMany(item => item.Parts).WithOne().HasForeignKey(part => part.AssetId);
        asset.HasMany(item => item.Events).WithOne().HasForeignKey(item => item.AssetId);
        asset.HasMany(item => item.Changes).WithOne().HasForeignKey(item => item.AssetId);
        modelBuilder.Entity<AssetPart>().HasIndex(part => new { part.AssetId, part.Vendor });
        modelBuilder.Entity<AssetEvent>().HasIndex(item => new { item.AssetId, item.At });
    }
}

/// <summary>A temporary SQLite database file seeded with the asset fixture and its details; deleted on dispose.</summary>
public sealed class SqliteAssets : IDisposable {
    public SqliteAssets(IReadOnlyList<Asset> assets) {
        Folder = Path.Combine(Path.GetTempPath(), "canopyx-record-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Folder);
        ConnectionString = new SqliteConnectionStringBuilder { DataSource = Path.Combine(Folder, "assets.db"), Pooling = false }.ToString();
        using var db = Create();
        db.Database.EnsureCreated();
        db.Set<AssetGroup>().AddRange(assets.Where(asset => asset.Group != null).Select(asset => asset.Group!).Distinct().Select(group => new AssetGroup { Id = group.Id, Name = group.Name }));
        db.SaveChanges();
        db.Assets.AddRange(assets.Select(asset => new Asset {
            Id = asset.Id, Name = asset.Name, Site = asset.Site, Cores = asset.Cores, Seen = asset.Seen, Serial = asset.Serial, Purchased = asset.Purchased,
            Weight = asset.Weight, Notes = asset.Notes, Secret = asset.Secret, GroupId = asset.GroupId,
            Parts = asset.Parts.Select(part => new AssetPart { Id = part.Id, Name = part.Name, Vendor = part.Vendor, Quantity = part.Quantity, Installed = part.Installed }).ToList(),
            Events = asset.Events.Select(item => new AssetEvent { Id = item.Id, At = item.At, Summary = item.Summary, Actor = item.Actor, Kind = item.Kind }).ToList(),
            Changes = asset.Changes.Select(item => new AssetChange { Id = item.Id, At = item.At, Setting = item.Setting, Before = item.Before, After = item.After }).ToList()
        }));
        db.SaveChanges();
        // Links to replaced assets refer to rows of the same table, so they are set once every asset exists.
        foreach (var asset in assets.Where(asset => asset.ReplacesId != null))
            db.Database.ExecuteSqlInterpolated($"UPDATE Assets SET ReplacesId = {asset.ReplacesId} WHERE Id = {asset.Id}");
    }

    public string Folder { get; }
    public string ConnectionString { get; }
    public List<string> Sql { get; } = new List<string>();

    public AssetDb Create(bool log = false) {
        var options = new DbContextOptionsBuilder<AssetDb>().UseSqlite(ConnectionString);
        if (log) options.LogTo(message => { lock (Sql) Sql.Add(message); }, new[] { DbLoggerCategory.Database.Command.Name });
        return new AssetDb(options.Options);
    }

    public void Dispose() {
        SqliteConnection.ClearAllPools();
        try { Directory.Delete(Folder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }
}
