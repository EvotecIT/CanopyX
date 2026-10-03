using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class RemoteQueryTests {
    private const string Children = "api/children?ref={ref}&cursor={cursor}&view={viewQuery}&revision={revision}";

    [Fact]
    public void QueryCapabilityIsExplicitAndEveryEndpointReceivesTheViewQuery() {
        var source = CanopySource.RemoteQuery(Children, "api/search?q={query}&limit={limit}&view={viewQuery}", "api/counts?ids={ids}&view={viewQuery}");
        var view = new CanopyView("v", "View") { Source = source };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var json = view.ToJson();
        Assert.True(source.QueryAware);
        Assert.True(JsonNode.Parse(json)!["source"]!["queryAware"]!.GetValue<bool>());
        ProtocolSchema.AssertValid(json, "query-aware remote source");
        foreach (var endpoint in new[] { "children", "search", "counts" }) {
            var invalid = ProtocolSchema.Mutate(json, doc => doc["source"]![endpoint] = doc["source"]![endpoint]!.GetValue<string>().Replace("{viewQuery}", "omitted"));
            Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
        }
        view.Source = CanopySource.Remote("api/children?ref={ref}&cursor={cursor}");
        Assert.False(view.Source.QueryAware);
        Assert.Null(JsonNode.Parse(view.ToJson())!["source"]!["queryAware"]);
        ProtocolSchema.AssertValid(view.ToJson(), "existing remote source");
    }

    [Theory]
    [InlineData("api?ref={ref}&cursor={cursor}", null, null)]
    [InlineData("api?ref={ref}&cursor={cursor}#view={viewQuery}", null, null)]
    [InlineData(Children, "search?q={query}&limit={limit}", null)]
    [InlineData(Children, null, "counts?ids={ids}#view={viewQuery}")]
    public void QueryEndpointCannotOmitOrHideItsQueryInAFragment(string children, string? search, string? counts) {
        Assert.Throws<ArgumentException>(() => CanopySource.RemoteQuery(children, search, counts));
    }

    [Theory]
    [InlineData("page")]
    [InlineData("search")]
    [InlineData("counts")]
    public void SnapshotRevisionIsOptionalForExistingSourcesAndRoundTripsForQuerySources(string type) {
        var page = new CanopyPage(null);
        var search = new CanopySearchResult("term");
        var counts = new CanopyCounts();
        Action<string?> set = type switch { "page" => value => page.Revision = value, "search" => value => search.Revision = value, _ => value => counts.Revision = value };
        Func<string> json = type switch { "page" => page.ToJson, "search" => search.ToJson, _ => counts.ToJson };
        Assert.Null(JsonNode.Parse(json())!["revision"]);
        const string revision = "snapshot/42/😀";
        set(revision);
        Assert.Equal(revision, JsonNode.Parse(json())!["revision"]!.GetValue<string>());
        ProtocolSchema.AssertValid(json(), type + " with revision");
        Assert.Throws<ArgumentException>(() => set(""));
        Assert.Throws<ArgumentException>(() => set("\ud800"));
        Assert.Equal(revision, JsonNode.Parse(json())!["revision"]!.GetValue<string>());
        var invalid = ProtocolSchema.Mutate(json(), doc => doc["revision"] = "");
        Assert.False(ProtocolSchema.Evaluate(invalid).IsValid);
        set(null);
        Assert.Null(JsonNode.Parse(json())!["revision"]);
    }
}
