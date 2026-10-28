using System.Text.Json.Nodes;

namespace CanopyX.Tests.Grids;

public sealed class GridStackTests {
    [Fact]
    public void Stack_SerializesOrderedLayersWithSharedBadgesAndRepeatedRecords() {
        var view = Grid();
        Assert.Null(JsonNode.Parse(view.ToJson())!["stack"]);
        view.Stack = new CanopyStack { TitleColumn = "title" };
        view.Stack.Layers.Add(new CanopyStackLayer("first", "r", "Starting value") { Label = "Baseline", Enforced = true });
        view.Stack.Layers.Add(new CanopyStackLayer("second", "r", "Host selected this result") {
            Winner = true, Badges = { new CanopyBadge("Reviewed", CanopyTone.Info) { Title = "Host review" } }
        });
        view.Stack.Layers.Add(new CanopyStackLayer("third", "r", "Outside the selected scope") { Filtered = true });
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""
            {"titleColumn":"title","layers":[
              {"id":"first","record":"r","reason":"Starting value","label":"Baseline","enforced":true},
              {"id":"second","record":"r","reason":"Host selected this result","winner":true,
               "badges":[{"text":"Reviewed","tone":"info","title":"Host review"}]},
              {"id":"third","record":"r","reason":"Outside the selected scope","filtered":true}]}
            """), JsonNode.Parse(view.ToJson())!["stack"]));
    }

    [Fact]
    public void Stack_AllowsEmptyAndOmitsUnspecifiedSettings() {
        var view = Grid(); view.Stack = new CanopyStack();
        Assert.Equal("{\"layers\":[]}", JsonNode.Parse(view.ToJson())!["stack"]!.ToJsonString());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void Stack_RejectsMissingOrMultipleWinners(int winners) {
        var view = Grid(); view.Stack = new CanopyStack();
        view.Stack.Layers.Add(new CanopyStackLayer("a", "r", "First") { Winner = winners > 0 });
        view.Stack.Layers.Add(new CanopyStackLayer("b", "r", "Second") { Winner = winners > 1 });
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Theory]
    [InlineData("duplicate")]
    [InlineData("unknownRecord")]
    [InlineData("unknownTitle")]
    [InlineData("filteredWinner")]
    [InlineData("ordinal")]
    [InlineData("host")]
    [InlineData("nullLayer")]
    [InlineData("nullBadge")]
    public void Stack_RejectsInvalidReferencesAndContradictoryStates(string invalid) {
        var view = Grid(); view.Stack = new CanopyStack();
        var layer = new CanopyStackLayer("a", invalid == "unknownRecord" ? "missing" : "r", "Host reason") { Winner = true };
        view.Stack.Layers.Add(layer);
        if (invalid == "duplicate") view.Stack.Layers.Add(new CanopyStackLayer("a", "r", "Repeated id"));
        if (invalid == "unknownTitle") view.Stack.TitleColumn = "missing";
        if (invalid == "filteredWinner") layer.Filtered = true;
        if (invalid == "ordinal") view.RowIdentity = CanopyGridRowIdentity.Ordinal;
        if (invalid == "host") { view.Rows.Clear(); view.Source = CanopyGridSource.HostedOffset(); }
        if (invalid == "nullLayer") view.Stack.Layers.Add(null!);
        if (invalid == "nullBadge") layer.Badges.Add(null!);
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Stack_Accepts1000LayersButRejects1001() {
        var view = Grid(); view.Stack = new CanopyStack();
        for (var index = 0; index < 1000; index++) view.Stack.Layers.Add(new CanopyStackLayer("l" + index, "r", "Host supplied reason") { Winner = index == 999 });
        view.Validate();
        Assert.Equal(1000, JsonNode.Parse(view.ToJson())!["stack"]!["layers"]!.AsArray().Count);
        view.Stack.Layers.Add(new CanopyStackLayer("extra", "r", "One layer too many"));
        Assert.Throws<InvalidOperationException>(view.Validate);
    }

    [Fact]
    public void Stack_RejectsBlankReasonsAndMalformedIdentitiesAtThePublicBoundary() {
        Assert.Throws<ArgumentException>(() => new CanopyStackLayer(" ", "r", "Reason"));
        Assert.Throws<ArgumentException>(() => new CanopyStackLayer("a", "\ud800", "Reason"));
        Assert.Throws<ArgumentException>(() => new CanopyStackLayer("a", "r", " \n"));
        Assert.Throws<ArgumentException>(() => new CanopyStackLayer("a", "r", "\u0085"));
        Assert.Equal("\ufeff", new CanopyStackLayer("a", "r", "\ufeff").Reason);
        var layer = new CanopyStackLayer("a", "r", "Reason");
        Assert.Throws<ArgumentException>(() => layer.Reason = "");
        Assert.Throws<ArgumentException>(() => new CanopyStack { TitleColumn = " " });
    }

    private static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("stack-test", "Configuration layers");
        view.Columns.Add(new CanopyColumn("title", "Configuration") { RowHeader = true });
        view.Rows.Add(new CanopyGridRow("r") { Cells = { ["title"] = "Shared defaults" } });
        return view;
    }
}
