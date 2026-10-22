using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class EnumCategoryOrderSqlTests {
    [Fact]
    public async Task SqliteTranslatesNormalizedEnumCategoryRanksAndKeepsFacetOrder() {
        using var connection = new SqliteConnection("Data Source=:memory:"); connection.Open();
        var commands = new List<string>();
        var options = new DbContextOptionsBuilder<EnumStore>().UseSqlite(connection)
            .LogTo(commands.Add, new[] { DbLoggerCategory.Database.Command.Name }).Options;
        using var database = new EnumStore(options); database.Database.EnsureCreated();
        database.AddRange(new[] { EnumDisplayNameTests.Platform.MacOs, EnumDisplayNameTests.Platform.Windows,
            EnumDisplayNameTests.Platform.FreeBsd, EnumDisplayNameTests.Platform.Linux, EnumDisplayNameTests.Platform.MacOs }
            .Select((platform, index) => new EnumDisplayNameTests.Device { Id = index + 1, Platform = platform }));
        database.SaveChanges(); commands.Clear();
        var view = new CanopyDataGridView("devices", "Devices") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true } };
        var column = new CanopyColumn("platform", "Platform") { Sortable = true }; column.ValueOrder.Add("Windows"); column.ValueOrder.Add("macOS");
        view.Columns.Add(column); view.Reporting.FacetColumns.Add("platform");
        var map = new CanopyColumnMap<EnumDisplayNameTests.Device>(view).Key(row => row.Id).Column("platform", row => row.Platform);
        var provider = new CanopyQueryableProvider<EnumDisplayNameTests.Device>(() => database.Set<EnumDisplayNameTests.Device>().AsNoTracking(), map,
            new CanopyQueryOptions { Executor = new EfExecutor(), Revision = _ => new ValueTask<string>("r1") });
        var handler = new CanopyRemoteHandler(map.Schema, provider);
        foreach (var direction in new[] { "asc", "desc" }) {
            using var page = JsonDocument.Parse(await handler.QueryAsync("{\"sort\":[{\"column\":\"platform\",\"direction\":\"" + direction + "\"}]}"));
            Assert.Equal(direction == "asc" ? new[] { "2", "1", "5", "3", "4" } : new[] { "4", "3", "1", "5", "2" },
                page.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()));
        }
        Assert.Contains(commands, command => command.Contains("CASE", StringComparison.OrdinalIgnoreCase));
        using var facet = JsonDocument.Parse(await handler.FacetAsync("{\"column\":\"platform\",\"query\":{\"revision\":\"r1\"}}"));
        Assert.Equal(new[] { "Windows", "macOS", "FreeBSD", "Linux" }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
        Assert.Equal(new[] { 1, 2, 1, 1 }, facet.RootElement.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("count").GetInt32()));
        using var summary = JsonDocument.Parse(await handler.SummaryAsync("{\"revision\":\"r1\",\"groupBy\":[{\"column\":\"platform\",\"direction\":\"asc\"}]}"));
        Assert.Equal(new[] { "Windows", "macOS", "FreeBSD", "Linux" }, summary.RootElement.GetProperty("groups").EnumerateArray().Select(item => item.GetProperty("value").GetString()));
    }

    private sealed class EnumStore : DbContext {
        internal EnumStore(DbContextOptions<EnumStore> options) : base(options) { }
        protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.Entity<EnumDisplayNameTests.Device>().HasKey(row => row.Id);
    }
}
