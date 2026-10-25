using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class BucketQueryTests {
    [Fact]
    public async Task NamedZoneBucketsUseTheHostsTranslatableDaylightSavingConversion() {
        var dates = new[] { "2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z" };
        var hosts = dates.Select((date, index) => new Host { Id = index + 1, LastSeen = DateTime.Parse(date, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal) }).ToArray();
        var view = new CanopyDataGridView("clock", "Clock") { Source = CanopyGridSource.HostedOffset(), Reporting = new CanopyGridReporting { Groupable = true } };
        view.Columns.Add(new CanopyColumn("at", "Observed") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("at", bucket: CanopyBucket.Calendar(CanopyBucketKind.Hour, "America/New_York")));
        var spring = new DateTime(2026, 3, 8, 7, 0, 0, DateTimeKind.Utc);
        var fall = new DateTime(2026, 11, 1, 6, 0, 0, DateTimeKind.Utc);
        var map = new CanopyColumnMap<Host>(view).Key(row => row.Id).Column("at", row => row.LastSeen, column => column.BucketTimeZone("America/New_York",
            row => row.LastSeen == null ? null : row.LastSeen >= spring && row.LastSeen < fall ? row.LastSeen.Value.AddHours(-4) : row.LastSeen.Value.AddHours(-5)));
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var sql = new CanopyRemoteHandler(map.Schema, provider);
        var reference = new CanopyRemoteHandler(map.Schema, new CanopyInMemoryProvider<Host>(map.Schema, () => hosts, row => row.Id.ToString(), new Dictionary<string, Func<Host, object?>> { ["at"] = row => row.LastSeen }, () => "r1"));
        const string request = "{\"revision\":\"r1\"}";
        Assert.Equal(await reference.SummaryAsync(request), await sql.SummaryAsync(request));
        using var summary = JsonDocument.Parse(await sql.SummaryAsync(request));
        Assert.Equal(new[] { 3, 1 }, summary.RootElement.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("count").GetInt32()));
    }

    [Theory]
    [InlineData("month")]
    [InlineData("hour")]
    public async Task BucketFacetsAndTheirNumericPredicatesAgreeOnSqlite(string kind) {
        var hosts = Fleet.Hosts(80);
        var view = Fleet.View();
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(view);
        var sql = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }));
        var reference = new Harness(hosts, ProviderKind.Reference, view: view).Handler;
        var request = "{\"column\":\"lastSeen\",\"bucket\":{\"kind\":\"" + kind + "\"},\"limit\":200,\"query\":{\"revision\":\"r1\"}}";
        var expected = await reference.FacetAsync(request);
        Assert.Equal(expected, await sql.FacetAsync(request));
        using var facets = JsonDocument.Parse(expected);
        var first = facets.RootElement.GetProperty("items")[0];
        var query = "{\"filters\":[{\"column\":\"lastSeen\",\"operator\":\"eq\",\"values\":[" + first.GetProperty("value").GetRawText() + "],\"bucket\":{\"kind\":\"" + kind + "\"}}]}";
        Assert.Equal(await reference.QueryAsync(query), await sql.QueryAsync(query));
        using var page = JsonDocument.Parse(await sql.QueryAsync(query));
        Assert.Equal(first.GetProperty("count").GetInt32(), page.RootElement.GetProperty("matched").GetInt32());
    }

    [Theory]
    [InlineData(CanopyBucketKind.Day)]
    [InlineData(CanopyBucketKind.Week)]
    [InlineData(CanopyBucketKind.Month)]
    [InlineData(CanopyBucketKind.Quarter)]
    [InlineData(CanopyBucketKind.Year)]
    [InlineData(CanopyBucketKind.Hour)]
    [InlineData(CanopyBucketKind.Weekday)]
    public async Task CalendarGroupsAndPagesAgreeWithReferenceOnSqlite(CanopyBucketKind kind) {
        var hosts = Fleet.Hosts(80);
        hosts[0].LastSeen = new DateTime(2020, 12, 31, 23, 59, 0, DateTimeKind.Utc);
        hosts[1].LastSeen = new DateTime(2021, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        hosts[2].LastSeen = new DateTime(2021, 1, 4, 0, 0, 0, DateTimeKind.Utc);
        var view = Fleet.View(); view.Reporting!.Groupable = true;
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("lastSeen", bucket: CanopyBucket.Calendar(kind)));
        using var store = new SqliteFleet(hosts); using var database = store.Create(log: true);
        var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var sql = new CanopyRemoteHandler(map.Schema, provider);
        var reference = new Harness(hosts, ProviderKind.Reference, view: view).Handler;
        var linq = new Harness(hosts, ProviderKind.Linq, view: view).Handler;
        const string query = "{\"revision\":\"r1\",\"limit\":13}";
        var expected = await reference.SummaryAsync(query);
        LinqOracleTests.AssertSameSummary(expected, await linq.SummaryAsync(query), "Calendar buckets differ from the reference.");
        LinqOracleTests.AssertSameSummary(expected, await sql.SummaryAsync(query), "Calendar buckets differ from the independent provider.");
        Assert.Equal(await reference.QueryAsync(query), await sql.QueryAsync(query));
        Assert.Contains(store.Sql, statement => statement.Contains("GROUP BY", StringComparison.OrdinalIgnoreCase));
        using var result = JsonDocument.Parse(expected);
        var groups = result.RootElement.GetProperty("groups").EnumerateArray().ToArray();
        Assert.Equal(hosts.Count, groups.Sum(group => group.GetProperty("count").GetInt32()));
        Assert.Equal(kind.ToString().ToLowerInvariant(), result.RootElement.GetProperty("query").GetProperty("groupBy")[0].GetProperty("bucket").GetProperty("kind").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task NumericRangesTranslateAndKeepBoundaryRecordsTogether(bool explicitEdges) {
        var hosts = new[] { -11d, -10d, -1d, 0d, 9.9, 10d, 100d }.Select((value, index) => new Host { Id = index + 1, Memory = value }).ToArray();
        var view = Fleet.View(); view.Reporting!.Groupable = true;
        var bucket = explicitEdges ? CanopyBucket.ExplicitEdges(-10, 0, 10) : CanopyBucket.FixedWidth(10);
        view.Reporting.GroupBy.Add(new CanopyGridGroupLevel("memory", bucket: bucket));
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var map = Fleet.Map(view);
        var sql = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }));
        var reference = new Harness(hosts, ProviderKind.Reference, view: view).Handler;
        LinqOracleTests.AssertSameSummary(await reference.SummaryAsync("{\"revision\":\"r1\"}"), await sql.SummaryAsync("{\"revision\":\"r1\"}"), "Numeric ranges differ from the independent provider.");
        Assert.Equal(await reference.QueryAsync("{}"), await sql.QueryAsync("{}"));
    }
}
