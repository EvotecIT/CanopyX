#if NET10_0_OR_GREATER
using CanopyX.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Xunit;

namespace CanopyX.Data.Tests.Compare;

public sealed class QueryableComparisonSqliteTests {
    [Fact]
    public async Task CompareAsync_ReadsTwoProjectedOrderedDatabaseVersionsWithinHostSnapshot() {
        using var connection = new SqliteConnection("Data Source=:memory:;Pooling=False");
        await connection.OpenAsync();
        var commands = new List<string>();
        var options = new DbContextOptionsBuilder<SnapshotDb>().UseSqlite(connection)
            .LogTo(commands.Add, new[] { RelationalEventId.CommandExecuted }).Options;
        using var db = new SnapshotDb(options);
        await db.Database.EnsureCreatedAsync();
        db.Items.AddRange(
            new SnapshotItem { Version = 1, Id = "b", Value = "same", Private = "not projected" },
            new SnapshotItem { Version = 1, Id = "a", Value = "old" },
            new SnapshotItem { Version = 1, Id = "gone", Value = "removed" },
            new SnapshotItem { Version = 2, Id = "a", Value = "new" },
            new SnapshotItem { Version = 2, Id = "b", Value = "same" },
            new SnapshotItem { Version = 2, Id = "new", Value = "added" });
        await db.SaveChangesAsync();
        using var snapshot = await db.Database.BeginTransactionAsync();
        var before = db.Items.AsNoTracking().Where(item => item.Version == 1).OrderBy(item => item.Id).Select(item => new { item.Id, item.Value });
        var after = db.Items.AsNoTracking().Where(item => item.Version == 2).OrderBy(item => item.Id).Select(item => new { item.Id, item.Value });
        commands.Clear();
        var result = await CanopyQueryableComparison.CompareAsync(before, after,
            item => Row(item.Id, item.Value), item => Row(item.Id, item.Value), rowLimit: 3);
        Assert.Equal(new[] { "a", "b", "gone", "new" }, result.Rows.Select(row => row.Id));
        Assert.Equal((1, 1, 1, 1), (result.Counts.Added, result.Counts.Removed, result.Counts.Changed, result.Counts.Unchanged));
        Assert.Equal("old", result.Rows[0].Before!.Cells["value"].Value);
        Assert.Equal("new", result.Rows[0].After!.Cells["value"].Value);
        Assert.Equal(2, commands.Count);
        Assert.All(commands, sql => {
            Assert.Contains("ORDER BY", sql);
            Assert.Contains("LIMIT", sql);
            Assert.DoesNotContain("\"Private\"", sql);
        });
    }

    private static CanopyGridRow Row(string id, string value) {
        var row = new CanopyGridRow(id); row.Cells["value"] = value; return row;
    }

    private sealed class SnapshotDb(DbContextOptions<SnapshotDb> options) : DbContext(options) {
        internal DbSet<SnapshotItem> Items => Set<SnapshotItem>();
        protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.Entity<SnapshotItem>().HasKey(item => new { item.Version, item.Id });
    }

    private sealed class SnapshotItem {
        public int Version { get; set; }
        public string Id { get; set; } = "";
        public string Value { get; set; } = "";
        public string Private { get; set; } = "";
    }
}
#endif
