using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Facet pages merge the protocol's Unicode buckets before searching, limiting and counting them.</summary>
public sealed class QueryableFacetUnicodeRegressionTests {
    [Theory]
    [InlineData("", 5, false, false, 12, 6)]
    [InlineData("", 200, false, false, 12, 6)]
    [InlineData("ä", 2, false, false, 12, 1)]
    [InlineData("Ω", 2, false, false, 12, 1)]
    [InlineData("no match", 2, false, false, 12, 0)]
    [InlineData("", 5, true, true, 9, 5)]
    [InlineData("", 5, false, true, 10, 6)]
    [InlineData("ä", 2, true, true, 9, 1)]
    [InlineData("ä", 2, false, true, 10, 1)]
    public async Task SqliteFacets_MatchCanonicalBucketsAndEffectiveFilters(string search, int limit, bool includeCurrentFilter,
        bool filtered, int matched, int totalValues) {
        var hosts = new[] { "Ä", "ä", "Å", "å", "Ö", "ö", "Ω", "ω", null, "", "Ä", "ä" }
            .Select((site, index) => new Host { Id = index + 1, Site = site, Online = index < 10 }).ToList();
        using var store = new SqliteFleet(hosts);
        using var database = store.Create();
        var (reference, sql) = Handlers(hosts, database);
        var filters = filtered ? new object[] {
            new { column = "online", @operator = "eq", values = new[] { true } },
            new { column = "site", @operator = "isNotNull", values = Array.Empty<string>() }
        } : Array.Empty<object>();
        var request = JsonSerializer.Serialize(new { column = "site", search, limit, includeCurrentFilter,
            query = new { revision = "r1", filters } });
        var expected = await reference.FacetAsync(request);
        using var result = JsonDocument.Parse(expected);
        Assert.Equal(matched, result.RootElement.GetProperty("matched").GetInt32());
        Assert.Equal(totalValues, result.RootElement.GetProperty("totalValues").GetInt32());
        Assert.Equal(Math.Min(limit, totalValues), result.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(totalValues > limit, result.RootElement.GetProperty("truncated").GetBoolean());
        if (search == "ä") {
            var item = result.RootElement.GetProperty("items")[0];
            Assert.Equal("Ä", item.GetProperty("value").GetString());
            Assert.Equal(filtered ? 2 : 4, item.GetProperty("count").GetInt32());
        }
        Assert.Equal(expected, await sql.FacetAsync(request));
    }

    [Fact]
    public async Task SqliteFacetPrefix_UsesCanonicalOrderAcrossNonadjacentStoreGroups() {
        var hosts = new[] { "ä", "Ö", "ö", "Ω", "ω" }
            .Select((site, index) => new Host { Id = index + 1, Site = site }).ToList();
        using var store = new SqliteFleet(hosts);
        using var database = store.Create();
        var (reference, sql) = Handlers(hosts, database);
        const string request = "{\"column\":\"site\",\"limit\":1,\"query\":{\"revision\":\"r1\"}}";
        var expected = await reference.FacetAsync(request);
        using var result = JsonDocument.Parse(expected);
        Assert.Equal(3, result.RootElement.GetProperty("totalValues").GetInt32());
        Assert.Equal("ä", result.RootElement.GetProperty("items")[0].GetProperty("value").GetString());
        Assert.Equal(expected, await sql.FacetAsync(request));
    }

    private static (CanopyRemoteHandler Reference, CanopyRemoteHandler Sql) Handlers(IReadOnlyList<Host> hosts, FleetDb database) {
        var map = Fleet.Map(Fleet.View());
        var reference = new CanopyInMemoryProvider<Host>(map.Schema, () => hosts,
            host => host.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), Harness.Values(), () => "r1");
        var sql = new CanopyQueryableProvider<Host>(() => database.Hosts, map,
            new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        return (new CanopyRemoteHandler(map.Schema, reference), new CanopyRemoteHandler(map.Schema, sql));
    }
}
