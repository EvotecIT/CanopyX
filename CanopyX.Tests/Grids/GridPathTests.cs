using System.Text.Json.Nodes;

namespace CanopyX.Tests.Grids;

public sealed class GridPathTests {
    [Fact]
    public void Path_WritesReferencesInExplicitOrderAndRetainsRepeatedOccurrences() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["path"]);
        view.Path = new CanopyPath { TitleColumn = "title" };
        var chain = new CanopyPathChain("route", "Approval <route>");
        chain.Hops.Add(new CanopyPathHop("b", "First review") {
            Flags = { CanopyPathFlag.Foreign }, Badges = { new CanopyBadge("Reviewers", CanopyTone.Info) { Title = "Two reviewers" } }
        });
        chain.Hops.Add(new CanopyPathHop("a"));
        chain.Hops.Add(new CanopyPathHop("b", "Return") { Flags = { CanopyPathFlag.Cycle, CanopyPathFlag.Disabled } });
        view.Path.Chains.Add(chain);
        var json = view.ToJson();
        var path = JsonNode.Parse(json)!["path"]!;
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""
            {"titleColumn":"title","chains":[{"id":"route","label":"Approval <route>","hops":[
              {"record":"b","label":"First review","flags":["foreign"],"badges":[{"text":"Reviewers","tone":"info","title":"Two reviewers"}]},
              {"record":"a"},{"record":"b","label":"Return","flags":["cycle","disabled"]}]}]}
            """), path));
        Assert.DoesNotContain("<route>", json);
        Assert.DoesNotContain("cells", path.ToJsonString());
        Assert.Equal(2, view.Rows.Count);
        Assert.Equal("Second record", view.Rows[1].Cells["title"].Value);
        view.Path = new CanopyPath();
        Assert.Equal("{\"chains\":[]}", JsonNode.Parse(view.ToJson())!["path"]!.ToJsonString());
    }

    [Fact]
    public void Path_RequiresInlineStableRecordsAndKnownReferences() {
        var view = WithPath();
        view.Path!.TitleColumn = "absent";
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Path.TitleColumn = null;
        view.Path.Chains[0].Hops.Add(new CanopyPathHop("absent"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.Path.Chains[0].Hops.RemoveAt(1);
        view.RowIdentity = CanopyGridRowIdentity.Ordinal;
        Assert.Throws<InvalidOperationException>(view.Validate);
        view.RowIdentity = CanopyGridRowIdentity.StableKey;
        view.Rows.Clear();
        view.Source = CanopyGridSource.HostedOffset();
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Path_EnforcesChainHopAndTotalBoundsAtTheirExactLimits() {
        var view = WithPath();
        var path = view.Path!;
        path.Chains.Clear();
        for (var index = 0; index < 200; index++) path.Chains.Add(Chain("c" + index, 1));
        view.Validate();
        path.Chains.Add(Chain("overflow", 1));
        Assert.Throws<InvalidOperationException>(view.Validate);
        path.Chains.Clear();
        path.Chains.Add(Chain("long", 256));
        view.Validate();
        path.Chains[0].Hops.Add(new CanopyPathHop("a"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        path.Chains.Clear();
        for (var index = 0; index < 40; index++) path.Chains.Add(Chain("c" + index, 250));
        view.Validate();
        path.Chains[0].Hops.Add(new CanopyPathHop("a"));
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Path_RejectsAmbiguousChainsNullEntriesAndUnknownOrDuplicateFlags() {
        var view = WithPath();
        var path = view.Path!;
        path.Chains.Add(Chain("route", 1));
        Assert.Throws<InvalidOperationException>(view.Validate);
        path.Chains.RemoveAt(1);
        path.Chains.Add(null!);
        Assert.Throws<InvalidOperationException>(view.Validate);
        path.Chains.RemoveAt(1);
        var chain = path.Chains[0];
        chain.Hops.Clear();
        Assert.Throws<InvalidOperationException>(view.Validate);
        chain.Hops.Add(null!);
        Assert.Throws<InvalidOperationException>(view.Validate);
        chain.Hops.Clear();
        var hop = new CanopyPathHop("a");
        chain.Hops.Add(hop);
        hop.Flags.Add((CanopyPathFlag)999);
        Assert.Throws<InvalidOperationException>(view.Validate);
        hop.Flags.Clear();
        hop.Flags.Add(CanopyPathFlag.Cycle);
        hop.Flags.Add(CanopyPathFlag.Cycle);
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Path_ValidatesTextAndBadgesWithoutChangingRecordMetadata() {
        Assert.Throws<ArgumentException>(() => new CanopyPathChain(" ", "Route"));
        Assert.Throws<ArgumentException>(() => new CanopyPathChain(new string('i', 257), "Route"));
        Assert.Throws<ArgumentException>(() => new CanopyPathHop("a", new string('x', 4097)));
        Assert.Throws<ArgumentException>(() => new CanopyPathHop("a", "broken\ud800"));
        Assert.Throws<ArgumentException>(() => new CanopyPathHop("a", "line\ncontrol"));
        var view = WithPath();
        var hop = view.Path!.Chains[0].Hops[0];
        for (var index = 0; index < 16; index++) hop.Badges.Add(new CanopyBadge("Badge " + index));
        view.Validate();
        hop.Badges.Add(new CanopyBadge("Overflow"));
        Assert.Throws<InvalidOperationException>(view.Validate);
        hop.Badges.Clear();
        hop.Badges.Add(null!);
        Assert.Throws<InvalidOperationException>(view.Validate);
        hop.Badges.Clear();
        hop.Badges.Add(new CanopyBadge(new string('x', 257)));
        Assert.Throws<ArgumentException>(view.Validate);
        hop.Badges.Clear();
        hop.Badges.Add(new CanopyBadge("Valid") { Title = "bad\udc00" });
        Assert.Throws<ArgumentException>(view.Validate);
        Assert.False(view.Rows[0].Cells["title"].HasBadges);
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("paths", "Approval paths");
        view.Columns.Add(new CanopyColumn("title", "Step") { RowHeader = true });
        view.Rows.Add(new CanopyGridRow("a") { Cells = { ["title"] = "First record" } });
        view.Rows.Add(new CanopyGridRow("b") { Cells = { ["title"] = "Second record" } });
        return view;
    }

    private static CanopyDataGridView WithPath() {
        var view = Grid();
        view.Path = new CanopyPath();
        view.Path.Chains.Add(Chain("route", 1));
        return view;
    }

    private static CanopyPathChain Chain(string id, int hops) {
        var chain = new CanopyPathChain(id, "Route");
        for (var index = 0; index < hops; index++) chain.Hops.Add(new CanopyPathHop("a"));
        return chain;
    }
}
