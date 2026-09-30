using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

/// <summary>
/// The writer and the checked-in schema describe the same protocol. Hosts that are not .NET build documents from the
/// schema, so a writer change that the schema does not describe (or the reverse) is a protocol break.
/// </summary>
public sealed class ProtocolSchemaTests {
    [Theory]
    [InlineData("entryCount")]
    [InlineData("entryFiles")]
    [InlineData("kinds")]
    [InlineData("shards")]
    public void Schema_ManifestSearch_NeedsEveryPartOfTheIndexDescription(string field) {
        var doc = JsonNode.Parse("{\"protocol\":\"canopyx/1\",\"type\":\"manifest\",\"view\":\"v\",\"root\":\"r/0\",\"nodeCount\":1,\"pageSize\":1,\"search\":{\"entryCount\":1,\"entryFiles\":[0],\"kinds\":[\"folder\"],\"shards\":{\"ab\":1}}}")!;
        ProtocolSchema.AssertValid(doc.ToJsonString(), "manifest with a search index");
        doc["search"]!.AsObject().Remove(field);
        Assert.False(ProtocolSchema.Evaluate(doc.ToJsonString()).IsValid);
    }

    [Theory]
    [InlineData("{\"words\":[\"ab\"],\"postings\":[[0,2,-3]]}", true)]
    [InlineData("{\"words\":[\"ab\"],\"postings\":[[]]}", false)]
    [InlineData("{\"words\":[\"ab\"],\"postings\":[[-1]]}", false)]
    [InlineData("{\"words\":[\"ab\"],\"postings\":[[3,0]]}", false)]
    [InlineData("{\"words\":[\"\"],\"postings\":[[3]]}", false)]
    [InlineData("{\"words\":[\"ab\"]}", false)]
    public void Schema_SearchShard_DescribesWordsAndPostingLists(string body, bool valid) {
        var doc = JsonNode.Parse(body)!.AsObject();
        doc["protocol"] = "canopyx/1"; doc["type"] = "searchShard"; doc["key"] = "ab";
        Assert.Equal(valid, ProtocolSchema.Evaluate(doc.ToJsonString()).IsValid);
    }

    [Theory]
    [InlineData("{\"first\":4,\"stem\":[[0,-1,0,\"root\",0,\"Root\",1]],\"entries\":[[0,4,\"/a\",0,\"A\"],[4,0,\"x\",2,\"B\",0]]}", true)]
    [InlineData("{\"first\":4,\"stem\":[],\"entries\":[[0,4,\"/a\",0]]}", false)]
    [InlineData("{\"first\":4,\"stem\":[],\"entries\":[[-2,0,\"a\",0,\"A\"]]}", false)]
    [InlineData("{\"first\":4,\"stem\":[],\"entries\":[[0,0,\"a\",0,\"A\",\"folder\"]]}", false)]
    [InlineData("{\"first\":4,\"stem\":[[-1,0,\"root\",0,\"Root\"]],\"entries\":[]}", false)]
    [InlineData("{\"stem\":[],\"entries\":[]}", false)]
    public void Schema_SearchEntries_DescribesEntriesAndTheirStem(string body, bool valid) {
        var doc = JsonNode.Parse(body)!.AsObject();
        doc["protocol"] = "canopyx/1"; doc["type"] = "searchEntries";
        Assert.Equal(valid, ProtocolSchema.Evaluate(doc.ToJsonString()).IsValid);
    }

    [Theory]
    [InlineData("{\"id\":\"x\",\"label\":\"x\",\"hasChildren\":true}")]
    [InlineData("{\"id\":\"x\",\"label\":\"x\",\"ref\":\"x\"}")]
    [InlineData("{\"id\":\"x\",\"label\":\"x\",\"children\":[{\"id\":\"y\",\"label\":\"y\",\"hasChildren\":true}]} ")]
    public void Schema_InlineView_RejectsUnloadedDescendants(string root) {
        var json = ProtocolSchema.Mutate(SampleDocuments.FullView().ToJson(), view => view["roots"] = new JsonArray(JsonNode.Parse(root)));
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Fact]
    public void Schema_RejectsUnsupportedSidecarSearchAndUndeclaredChildren() {
        var sidecar = ProtocolSchema.Mutate(SampleDocuments.FullView(CanopySource.Sidecar("data/files")).ToJson(), view => view["search"]!["minLength"] = 1);
        Assert.False(ProtocolSchema.Evaluate(sidecar).IsValid);
        var page = ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), doc => doc["items"] = JsonNode.Parse("[{\"id\":\"x\",\"label\":\"x\",\"childCount\":2}]"));
        Assert.False(ProtocolSchema.Evaluate(page).IsValid);
    }

    public static TheoryData<string, string> Documents() => new() {
        { "view, inline source", SampleDocuments.FullView().ToJson() },
        { "view, sidecar source", SampleDocuments.FullView(CanopySource.Sidecar("data/files")).ToJson() },
        { "view, remote source", SampleDocuments.FullView(CanopySource.Remote("api/children?ref={ref}&cursor={cursor}", "api/search?q={query}&limit={limit}", "api/counts?ids={ids}")).ToJson() },
        { "page", SampleDocuments.Page().ToJson() },
        { "search", SampleDocuments.Search().ToJson() },
        { "counts", SampleDocuments.Counts().ToJson() }
    };

    [Theory]
    [MemberData(nameof(Documents))]
    public void ToJson_EveryDocumentKind_MatchesSchema(string kind, string json) {
        ProtocolSchema.AssertValid(json, kind);
    }

    /// <summary>Documents that break a rule the C# writer enforces must also fail the schema, so the two cannot drift apart.</summary>
    public static TheoryData<string> RejectedMutations() => new() {
        "other protocol version",
        "misspelt node field",
        "detail row with children",
        "empty ref",
        "empty continuation",
        "roots in a sidecar view",
        "remote source without cursor placeholder",
        "unknown tone"
    };

    [Theory]
    [MemberData(nameof(RejectedMutations))]
    public void Schema_DocumentBreakingAWriterRule_IsRejected(string rule) {
        var json = rule switch {
            "other protocol version" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["protocol"] = "canopyx/2"),
            "misspelt node field" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["items"]![0]!.AsObject()["hasChildrn"] = true),
            "detail row with children" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["items"]![0]!.AsObject()["detail"] = JsonNode.Parse("{\"type\":\"html\",\"height\":2,\"html\":\"x\"}")),
            "empty ref" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["items"]![0]!.AsObject()["ref"] = ""),
            "empty continuation" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["next"] = ""),
            "roots in a sidecar view" => ProtocolSchema.Mutate(SampleDocuments.FullView(CanopySource.Sidecar("data/files")).ToJson(), view => view["roots"] = new JsonArray()),
            "remote source without cursor placeholder" => ProtocolSchema.Mutate(SampleDocuments.FullView(CanopySource.Remote("c?ref={ref}&cursor={cursor}", "s?q={query}&limit={limit}")).ToJson(), view => view["source"]!["children"] = "c?ref={ref}"),
            "unknown tone" => ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), page => page["items"]![0]!.AsObject()["badges"] = JsonNode.Parse("[{\"text\":\"x\",\"tone\":\"red\"}]")),
            _ => throw new ArgumentOutOfRangeException(nameof(rule))
        };

        Assert.False(ProtocolSchema.Evaluate(json).IsValid, rule);
    }

    [Fact]
    public void ToJson_InlineSource_WritesRootsAndOtherSourcesDoNot() {
        var inline = JsonNode.Parse(SampleDocuments.FullView().ToJson())!;
        var sidecar = JsonNode.Parse(SampleDocuments.FullView(CanopySource.Sidecar("data/files")).ToJson())!;

        Assert.Equal(2, inline["roots"]!.AsArray().Count);
        Assert.Equal("share/plans", inline["roots"]![0]!["children"]![0]!["id"]!.GetValue<string>());
        Assert.Null(sidecar["roots"]);
        Assert.Equal("data/files/", sidecar["source"]!["base"]!.GetValue<string>());
    }

    [Fact]
    public void ToJson_LazyNodeOnPage_WritesDeclarationWithoutChildren() {
        var page = JsonNode.Parse(SampleDocuments.Page().ToJson())!;
        var revision = page["items"]![0]!;

        Assert.True(revision["hasChildren"]!.GetValue<bool>());
        Assert.Equal(3, revision["childCount"]!.GetValue<int>());
        Assert.Equal("rev-100/changes", revision["ref"]!.GetValue<string>());
        Assert.Null(revision["children"]);
        Assert.Equal("cursor-3", page["next"]!.GetValue<string>());
    }
}
