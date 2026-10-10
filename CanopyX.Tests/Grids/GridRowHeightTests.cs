using System.Text.Json;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridRowHeightTests {
    [Fact]
    public void AutomaticHeightsAndWrappingRoundTripThroughTheWriterAndSchema() {
        var view = new CanopyDataGridView("notes", "Notes") { AutoRowHeight = true, RowHeight = 32 };
        view.Columns.Add(new CanopyColumn("notes", "Notes") { Wrap = true });
        var row = new CanopyGridRow("a"); row.Cells["notes"] = "First line\nSecond line"; view.Rows.Add(row);
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "automatic row layout");
        using var doc = JsonDocument.Parse(json);
        Assert.Equal(32, doc.RootElement.GetProperty("rowHeight").GetInt32());
        Assert.True(doc.RootElement.GetProperty("autoRowHeight").GetBoolean());
        Assert.True(doc.RootElement.GetProperty("columns")[0].GetProperty("wrap").GetBoolean());
        view.AutoRowHeight = false; json = view.ToJson(); ProtocolSchema.AssertValid(json, "fixed row layout");
        using var fixedDoc = JsonDocument.Parse(json);
        Assert.Equal(32, fixedDoc.RootElement.GetProperty("rowHeight").GetInt32());
        Assert.False(fixedDoc.RootElement.TryGetProperty("autoRowHeight", out _));
    }
}
