using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class ProtocolBoundaryTests {
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
