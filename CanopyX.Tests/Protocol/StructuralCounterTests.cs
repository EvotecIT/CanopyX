using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class StructuralCounterTests {
    [Theory]
    [InlineData("offset", 2147483647L)]
    [InlineData("pageTotal", 2147483647L)]
    [InlineData("nodeChildren", 2147483647L)]
    [InlineData("countChildren", 2147483647L)]
    [InlineData("searchTotal", 2147483647L)]
    [InlineData("nodeCount", 2147483647L)]
    [InlineData("shardCount", 2147483647L)]
    [InlineData("entryCount", 2147483647L)]
    [InlineData("width", 2147483647L)]
    [InlineData("manifestPageSize", 10000L)]
    public void StructuralCountersMatchWriterRanges(string counter, long maximum) {
        ProtocolSchema.AssertValid(Document(counter, maximum), counter + " maximum");
        Assert.False(ProtocolSchema.Evaluate(Document(counter, maximum + 1)).IsValid);
        Assert.False(ProtocolSchema.Evaluate(Document(counter, 9007199254740993L)).IsValid);
    }

    [Fact]
    public void ManifestListsEveryMultipartFileWithItsOwnPostingCount() {
        var doc = JsonNode.Parse("{\"protocol\":\"canopyx/2\",\"type\":\"manifest\",\"view\":\"v\",\"root\":\"r/0\",\"nodeCount\":1,\"pageSize\":1,\"search\":{\"entryCount\":7,\"entryFiles\":[0],\"kinds\":[],\"shards\":{\"ab\":2,\"ab.2\":2,\"ab.3\":1,\"ab-\":1,\"ab-.2\":1}}}")!;
        ProtocolSchema.AssertValid(doc.ToJsonString(), "multipart manifest");
    }

    private static string Document(string counter, long value) {
        var page = JsonNode.Parse("{\"protocol\":\"canopyx/2\",\"type\":\"page\",\"parent\":null,\"offset\":0,\"items\":[],\"next\":null}")!;
        var manifest = JsonNode.Parse("{\"protocol\":\"canopyx/2\",\"type\":\"manifest\",\"view\":\"v\",\"root\":\"r/0\",\"nodeCount\":1,\"pageSize\":1}")!;
        switch (counter) {
            case "offset": page["offset"] = value; page["total"] = value; return page.ToJsonString();
            case "pageTotal": page["total"] = value; page["next"] = "more"; return page.ToJsonString();
            case "nodeChildren":
                page["items"] = JsonNode.Parse("[{\"id\":\"n\",\"label\":\"N\",\"hasChildren\":true}]");
                page["items"]![0]!["childCount"] = value; return page.ToJsonString();
            case "countChildren":
                var counts = JsonNode.Parse("{\"protocol\":\"canopyx/2\",\"type\":\"counts\",\"items\":[{\"id\":\"n\"}]}")!;
                counts["items"]![0]!["childCount"] = value; return counts.ToJsonString();
            case "searchTotal":
                var search = JsonNode.Parse("{\"protocol\":\"canopyx/2\",\"type\":\"search\",\"query\":\"q\",\"hits\":[],\"truncated\":true}")!;
                search["total"] = value; return search.ToJsonString();
            case "nodeCount": manifest["nodeCount"] = value; return manifest.ToJsonString();
            case "manifestPageSize": manifest["pageSize"] = value; return manifest.ToJsonString();
            case "shardCount":
                manifest["search"] = JsonNode.Parse("{\"entryCount\":1,\"entryFiles\":[0],\"kinds\":[],\"shards\":{\"ab\":1}}");
                manifest["search"]!["shards"]!["ab"] = value; return manifest.ToJsonString();
            case "entryCount":
                manifest["search"] = JsonNode.Parse("{\"entryCount\":1,\"entryFiles\":[0],\"kinds\":[],\"shards\":{\"ab\":1}}");
                manifest["search"]!["entryCount"] = value; return manifest.ToJsonString();
            case "width":
                return ProtocolSchema.Mutate(SampleDocuments.FullView().ToJson(), v => v["columns"]![0]!["width"] = value);
            default: throw new ArgumentException("Unknown counter", nameof(counter));
        }
    }
}
