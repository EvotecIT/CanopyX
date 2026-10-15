using System.Text.Json.Nodes;

namespace CanopyX.Tests.Protocol;

/// <summary>A column names a plugin's cell renderer; the field is optional, additive and the same on trees and flat grids.</summary>
public sealed class ColumnRendererTests {
    [Fact]
    public void Renderer_IsWrittenForTreeAndGridColumnsAndMatchesTheSchema() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Columns.Add(new CanopyColumn("load", "Load") { Kind = CanopyColumnKind.Number, Renderer = "load-meter" });
        var treeJson = tree.ToJson();
        Assert.Equal("load-meter", (string?)JsonNode.Parse(treeJson)!["columns"]![1]!["renderer"]);
        Assert.Null(JsonNode.Parse(treeJson)!["columns"]![0]!["renderer"]);
        ProtocolSchema.AssertValid(treeJson, "A tree view with a column renderer");

        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name") { Renderer = "Badge_2" });
        var gridJson = grid.ToJson();
        Assert.Equal("Badge_2", (string?)JsonNode.Parse(gridJson)!["columns"]![0]!["renderer"]);
        ProtocolSchema.AssertValid(gridJson, "A grid view with a column renderer");
    }

    [Theory]
    [InlineData("")]
    [InlineData("1meter")]
    [InlineData("load meter")]
    [InlineData("load.meter")]
    public void Renderer_RejectsNamesOutsideThePattern(string name) {
        Assert.Throws<ArgumentException>(() => new CanopyColumn("load", "Load") { Renderer = name });
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        var json = ProtocolSchema.Mutate(tree.ToJson(), view => view["columns"]![0]!.AsObject()["renderer"] = name);
        Assert.False(ProtocolSchema.Evaluate(json).IsValid);
    }

    [Fact]
    public void Renderer_AcceptsSixtyFourCharacters() {
        var name = "r" + new string('x', 63);
        Assert.Equal(name, new CanopyColumn("load", "Load") { Renderer = name }.Renderer);
        Assert.Throws<ArgumentException>(() => new CanopyColumn("load", "Load") { Renderer = name + "x" });
    }
}