using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class ProtocolBoundaryTests {
    [Fact]
    public void NonemptyInlineChildrenCannotDeclareALeaf() {
        var view = new CanopyView("tree", "Tree");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var parent = new CanopyNode("parent", "Parent");
        parent.Children.Add(new CanopyNode("child", "Child"));
        view.Roots.Add(parent);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "inline parent");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, p => p["roots"]![0]!["hasChildren"] = false)).IsValid);
        var page = new CanopyPage(null); page.Items.Add(parent);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(page.ToJson(), p => p["items"]![0]!["hasChildren"] = false)).IsValid);
    }

    [Fact]
    public void AccessibleLabelsAndCellKeysHaveUsableNames() {
        Assert.Throws<ArgumentException>(() => new CanopyView("view", " \t"));
        Assert.Throws<ArgumentException>(() => new CanopyColumn("name", " "));
        Assert.Throws<ArgumentException>(() => new CanopyFilter("filter", " ", "flag"));
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(SampleDocuments.FullView().ToJson(), v => v["label"] = " ")).IsValid);
        var page = new CanopyPage(null);
        var node = new CanopyNode("node", "Node"); node.Cells[""] = "Value"; page.Items.Add(node);
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        var counts = new CanopyCounts(); var entry = new CanopyCountEntry("node"); entry.Cells[""] = "Value"; counts.Items.Add(entry);
        Assert.Throws<InvalidOperationException>(() => counts.ToJson());
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), v => v["items"]![0]!["cells"] = JsonNode.Parse("{\"\":\"Value\"}"))).IsValid);
    }

    [Fact]
    public void SchemaDistinguishesLazyChildrenFromAnEmptyInlineArray() {
        var json = ProtocolSchema.Mutate(SampleDocuments.Page().ToJson(), p => p["items"] = JsonNode.Parse("[{\"id\":\"x\",\"label\":\"X\",\"hasChildren\":true,\"children\":[]}]"));
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Theory]
    [InlineData("ab", true)]
    [InlineData("a_00e9", true)]
    [InlineData("_d800_dfff", true)]
    [InlineData("ab-", true)]
    [InlineData("a-", true)]
    [InlineData("_00e9-", true)]
    [InlineData("a", false)]
    [InlineData("__", false)]
    [InlineData("_00e9", false)]
    [InlineData("a_", false)]
    [InlineData("_00zzb", false)]
    public void SchemaValidatesEncodedShardUnits(string key, bool valid) {
        var manifest = new JsonObject { ["protocol"] = "canopyx/2", ["type"] = "manifest", ["view"] = "v", ["root"] = "r", ["nodeCount"] = 0, ["pageSize"] = 10,
            ["search"] = new JsonObject { ["entryCount"] = 1, ["entryFiles"] = new JsonArray(0), ["kinds"] = new JsonArray(), ["shards"] = new JsonObject { [key] = 1 } } };
        var shard = new JsonObject { ["protocol"] = "canopyx/2", ["type"] = "searchShard", ["key"] = key, ["words"] = new JsonArray(), ["postings"] = new JsonArray() };
        Assert.Equal(valid, ProtocolSchema.Evaluate(manifest.ToJsonString()).IsValid);
        Assert.Equal(valid, ProtocolSchema.Evaluate(shard.ToJsonString()).IsValid);
        shard["key"] = key + ".2";
        Assert.Equal(valid, ProtocolSchema.Evaluate(shard.ToJsonString()).IsValid);
    }

    [Fact]
    public void DeepInlineHierarchySerializesWithoutCallStackGrowth() {
        var page = new CanopyPage(null);
        var root = new CanopyNode("0", "Root"); page.Items.Add(root);
        for (var index = 1; index <= 10000; index++) {
            var child = new CanopyNode(index.ToString(), "Child");
            root.Children.Add(child); root = child;
        }
        var json = page.ToJson();
        Assert.Contains("\"id\":\"10000\"", json);
        using var parsed = System.Text.Json.JsonDocument.Parse(json, new System.Text.Json.JsonDocumentOptions { MaxDepth = 25000 });
        Assert.Equal("page", parsed.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public void OrphanReferencesAndEmptyAccessibleSearchNamesAreRejected() {
        var page = new CanopyPage(null);
        page.Items.Add(new CanopyNode("a", "A") { Ref = "a" });
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        page.Items[0].HasChildren = true;
        var valid = page.ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(valid, p => p["items"]![0]!.AsObject().Remove("hasChildren"))).IsValid);
        foreach (var label in new[] { "", " \t" }) {
            Assert.Throws<ArgumentException>(() => new CanopySearchOptions { Placeholder = label });
            Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(SampleDocuments.FullView().ToJson(), v => v["search"]!["placeholder"] = label)).IsValid);
        }
    }

    [Fact]
    public void PageCannotContainItsParentAndSearchTruncationMatchesTotal() {
        var page = new CanopyPage("parent");
        var child = new CanopyNode("child", "Child");
        child.Children.Add(new CanopyNode("parent", "Parent"));
        page.Items.Add(child);
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        var search = new CanopySearchResult("query") { Total = 1 };
        Assert.Throws<InvalidOperationException>(() => search.ToJson());
        search.Truncated = true;
        ProtocolSchema.AssertValid(search.ToJson(), "truncated search");
        search.Total = 0;
        Assert.Throws<InvalidOperationException>(() => search.ToJson());
    }

    [Fact]
    public void InlineRootsAndRemoteSearchEndpointAreRequired() {
        var inline = SampleDocuments.FullView().ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(inline, v => v.AsObject().Remove("roots"))).IsValid);
        var remote = SampleDocuments.FullView(CanopySource.Remote("c?ref={ref}&cursor={cursor}", "s?q={query}&limit={limit}"));
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(remote.ToJson(), v => v["source"]!.AsObject().Remove("search"))).IsValid);
        remote.Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}");
        Assert.Throws<InvalidOperationException>(() => remote.ToJson());
        remote.Search = null;
        ProtocolSchema.AssertValid(remote.ToJson(), "remote without search");
    }

    [Fact]
    public void RemoteSearchRequiresLimitAndSchemaRejectsHiddenTreeColumn() {
        Assert.Throws<ArgumentException>(() => CanopySource.Remote("c?ref={ref}&cursor={cursor}", "s?q={query}"));
        var view = SampleDocuments.FullView().ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(view, v => v["columns"]![0]!["hidden"] = true)).IsValid);
        var remote = SampleDocuments.FullView(CanopySource.Remote("c?ref={ref}&cursor={cursor}", "s?q={query}&limit={limit}")).ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(remote, v => v["source"]!["search"] = "s?q={query}")).IsValid);
    }

    [Fact]
    public void SearchPathsAndCountsRejectRepeatedIds() {
        Assert.Throws<ArgumentException>(() => new CanopySearchHit(new[] { "root", "root" }, "Match"));
        var search = SampleDocuments.Search().ToJson();
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(search, v => v["hits"]![0]!["path"] = new JsonArray("root", "root"))).IsValid);
        var counts = new CanopyCounts();
        counts.Items.Add(new CanopyCountEntry("root"));
        counts.Items.Add(new CanopyCountEntry("root"));
        Assert.Throws<InvalidOperationException>(() => counts.ToJson());
    }

    [Fact]
    public void SearchAndPageTotalsAgreeWithReturnedItemsAndContinuation() {
        var search = new CanopySearchResult("query") { Total = 0 };
        search.Hits.Add(new CanopySearchHit(new[] { "root" }, "Match"));
        Assert.Throws<InvalidOperationException>(() => search.ToJson());
        var page = new CanopyPage(null) { Total = 2 };
        page.Items.Add(new CanopyNode("root", "Root"));
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        page.Next = "next";
        ProtocolSchema.AssertValid(page.ToJson(), "partial page");
        page.Total = 1;
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
        page.Next = null;
        ProtocolSchema.AssertValid(page.ToJson(), "last page");
        page.Offset = int.MaxValue;
        page.Total = int.MaxValue;
        Assert.Throws<InvalidOperationException>(() => page.ToJson());
    }

    [Fact]
    public void UnsafeNumbersAreRejectedAndExactTextRemainsAvailable() {
        var page = new CanopyPage(null);
        var node = new CanopyNode("root", "Root");
        page.Items.Add(node);
        foreach (var cell in new[] { new CanopyCell(long.MaxValue), new CanopyCell(long.MinValue), new CanopyCell(9007199254740992d), new CanopyCell(9007199254740992m) }) {
            node.Cells["value"] = cell;
            Assert.Throws<InvalidOperationException>(() => page.ToJson());
        }
        node.Cells["value"] = 9007199254740991L;
        ProtocolSchema.AssertValid(page.ToJson(), "safe integer boundary");
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(page.ToJson(), p => p["items"]![0]!["cells"]!["value"] = long.MaxValue)).IsValid);
        node.Cells["value"] = long.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture);
        Assert.Contains("9223372036854775807", page.ToJson());
    }
}
