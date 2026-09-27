using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

public sealed class ProtocolBoundaryTests {
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
