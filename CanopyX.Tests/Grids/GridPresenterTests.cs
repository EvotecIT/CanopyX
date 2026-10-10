using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridPresenterTests {
    [Fact]
    public void ReportingPresenters_WriteValidatedDescriptorsWithoutChangingRawCells() {
        var view = new CanopyDataGridView("presenters", "Rich inventory") { Reporting = new CanopyGridReporting() };
        foreach (var id in new[] { "name", "url", "icon", "flag", "list", "notes" }) view.Columns.Add(new CanopyColumn(id, id));
        view.Columns.Add(new CanopyColumn("done", "Completed") { Kind = CanopyColumnKind.Number });
        view.GetColumn("name").Presenter = CanopyGridPresenter.Link("url", newWindow: true);
        view.GetColumn("icon").Presenter = CanopyGridPresenter.Icon("●");
        view.GetColumn("done").Presenter = CanopyGridPresenter.Progress(200);
        view.GetColumn("flag").Presenter = CanopyGridPresenter.Boolean();
        view.GetColumn("list").Presenter = CanopyGridPresenter.List(";", 2);
        view.GetColumn("notes").Presenter = CanopyGridPresenter.LongText();
        var row = new CanopyGridRow("record"); row.Cells["done"] = 125; row.Cells["notes"] = "<b>plain</b>"; view.Rows.Add(row);
        ProtocolSchema.AssertValid(view.ToJson(), "safe presenters");
        using var json = JsonDocument.Parse(view.ToJson());
        var columns = json.RootElement.GetProperty("columns");
        Assert.Equal("url", columns[0].GetProperty("presenter").GetProperty("hrefColumn").GetString());
        Assert.True(columns[0].GetProperty("presenter").GetProperty("newWindow").GetBoolean());
        Assert.Equal(200, columns[6].GetProperty("presenter").GetProperty("maximum").GetDouble());
        Assert.Equal(125, json.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("done").GetInt32());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Equal("{column}: show complete text", view.Labels.GridExpandCell);
        Assert.Equal("Close complete text", view.Labels.GridCloseCell);
    }

    [Fact]
    public void PresenterBindings_RejectIncompatibleKindsUnknownDestinationsAndInvalidBounds() {
        var view = new CanopyDataGridView("bad", "Invalid") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.GetColumn("name").Presenter = CanopyGridPresenter.Progress();
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.GetColumn("name").Presenter = CanopyGridPresenter.Link("missing");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.Icon(" "));
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.List(""));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.List(",", 17));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Progress(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Progress(0));
    }
}
