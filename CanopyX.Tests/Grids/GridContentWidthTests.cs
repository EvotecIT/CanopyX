using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridContentWidthTests {
    [Fact]
    public void AdditiveAutoWidthsPreserveNumericWireWidthsAndExplicitTreeDefaults() {
        var view = new CanopyDataGridView("widths", "Widths") { Reporting = new CanopyGridReporting() };
        var implicitWidth = new CanopyColumn("name", "Name");
        view.Columns.Add(implicitWidth);
        view.Columns.Add(new CanopyColumn("fixed", "Fixed") { Sizing = CanopyColumnSizing.Preferred(160) });
        view.GetColumn("name").Sizing = CanopyColumnSizing.Flex(1, 300, 500, view.GetColumn("name").Sizing.Width);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "content widths with bounds");
        using var doc = JsonDocument.Parse(json);
        Assert.Equal(300, doc.RootElement.GetProperty("columns")[0].GetProperty("width").GetInt32());
        Assert.True(doc.RootElement.GetProperty("columns")[0].GetProperty("autoWidth").GetBoolean());
        Assert.Equal(160, doc.RootElement.GetProperty("columns")[1].GetProperty("width").GetInt32());
        Assert.False(doc.RootElement.GetProperty("columns")[1].TryGetProperty("autoWidth", out _));
        var tree = new CanopyTreeView("tree", "Tree"); tree.Columns.Add(implicitWidth);
        ProtocolSchema.AssertValid(tree.ToJson(), "unchanged tree column width");
        using var treeDoc = JsonDocument.Parse(tree.ToJson());
        Assert.Equal(300, treeDoc.RootElement.GetProperty("columns")[0].GetProperty("width").GetInt32());
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Preferred(200, 300, 500));
    }
}
