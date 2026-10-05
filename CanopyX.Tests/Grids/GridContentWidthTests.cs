using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridContentWidthTests {
    [Fact]
    public void AdditiveAutoWidthsPreserveNumericWireWidthsAndExplicitTreeDefaults() {
        var view = new CanopyGridView("widths", "Widths") { Reporting = new CanopyGridReporting() };
        var implicitWidth = new CanopyColumn("name", "Name");
        view.Columns.Add(implicitWidth);
        view.Columns.Add(new CanopyColumn("fixed", "Fixed") { Width = 160 });
        view.Reporting.Layout["name"] = new CanopyGridColumnLayout(300, 500, 1);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "content widths with bounds");
        using var doc = JsonDocument.Parse(json);
        Assert.Equal(300, doc.RootElement.GetProperty("columns")[0].GetProperty("width").GetInt32());
        Assert.True(doc.RootElement.GetProperty("columns")[0].GetProperty("autoWidth").GetBoolean());
        Assert.Equal(160, doc.RootElement.GetProperty("columns")[1].GetProperty("width").GetInt32());
        Assert.False(doc.RootElement.GetProperty("columns")[1].TryGetProperty("autoWidth", out _));
        var tree = new CanopyView("tree", "Tree"); tree.Columns.Add(implicitWidth);
        ProtocolSchema.AssertValid(tree.ToJson(), "unchanged tree column width");
        using var treeDoc = JsonDocument.Parse(tree.ToJson());
        Assert.Equal(160, treeDoc.RootElement.GetProperty("columns")[0].GetProperty("width").GetInt32());
        implicitWidth.Width = 200;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
