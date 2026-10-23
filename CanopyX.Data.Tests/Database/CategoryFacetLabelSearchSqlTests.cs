using System.Text.Json;
using Xunit;

namespace CanopyX.Data.Tests;

public sealed class CategoryFacetLabelSearchSqlTests {
    [Fact]
    public async Task SqliteFacetLabelSearchMatchesReferenceBeyondTheFirstTwoHundredBuckets() {
        var hosts = Enumerable.Range(1, 205).Select(i => new Host { Id = i, Site = i == 205 ? "fail" : "category-" + i.ToString("D3") }).ToArray();
        using var store = new SqliteFleet(hosts); using var database = store.Create();
        var view = Fleet.View(); view.GetColumn("site").ValueLabels.Add("fail", "Needs review");
        var reference = new Harness(hosts, ProviderKind.Reference, view: view).Handler;
        var map = Fleet.Map(view);
        var provider = new CanopyQueryableProvider<Host>(() => database.Hosts, map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") });
        var sql = new CanopyRemoteHandler(map.Schema, provider);
        const string request = "{\"column\":\"site\",\"search\":\"review\",\"limit\":1,\"query\":{\"revision\":\"r1\"}}";
        var expected = await reference.FacetAsync(request);
        Assert.Equal(expected, await sql.FacetAsync(request));
        using var result = JsonDocument.Parse(expected);
        Assert.Equal("fail", Assert.Single(result.RootElement.GetProperty("items").EnumerateArray()).GetProperty("value").GetString());
    }
}
