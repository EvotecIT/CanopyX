using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridPresenterTests {
    [Fact]
    public void ReportingPresenters_WriteValidatedDescriptorsWithoutChangingRawCells() {
        var view = new CanopyGridView("presenters", "Rich inventory") { Reporting = new CanopyGridReporting() };
        foreach (var id in new[] { "name", "url", "icon", "flag", "list", "notes" }) view.Columns.Add(new CanopyColumn(id, id));
        view.Columns.Add(new CanopyColumn("done", "Completed") { Kind = CanopyColumnKind.Number });
        view.Reporting.Presenters.Add("name", CanopyGridPresenter.Link("url", newWindow: true));
        view.Reporting.Presenters.Add("icon", CanopyGridPresenter.Icon("●"));
        view.Reporting.Presenters.Add("done", CanopyGridPresenter.Progress(200));
        view.Reporting.Presenters.Add("flag", CanopyGridPresenter.Boolean());
        view.Reporting.Presenters.Add("list", CanopyGridPresenter.List(";", 2));
        view.Reporting.Presenters.Add("notes", CanopyGridPresenter.LongText());
        var row = new CanopyGridRow("record"); row.Cells["done"] = 125; row.Cells["notes"] = "<b>plain</b>"; view.Rows.Add(row);
        ProtocolSchema.AssertValid(view.ToJson(), "safe presenters");
        using var json = JsonDocument.Parse(view.ToJson());
        var presenters = json.RootElement.GetProperty("reporting").GetProperty("presenters");
        Assert.Equal("url", presenters.GetProperty("name").GetProperty("hrefColumn").GetString());
        Assert.True(presenters.GetProperty("name").GetProperty("newWindow").GetBoolean());
        Assert.Equal(200, presenters.GetProperty("done").GetProperty("maximum").GetDouble());
        Assert.Equal(125, json.RootElement.GetProperty("rows")[0].GetProperty("cells").GetProperty("done").GetInt32());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Equal("{column}: show complete text", view.Labels.GridExpandCell);
        Assert.Equal("Close complete text", view.Labels.GridCloseCell);
    }

    [Fact]
    public void PresenterBindings_RejectIncompatibleKindsUnknownDestinationsAndInvalidBounds() {
        var view = new CanopyGridView("bad", "Invalid") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Reporting.Presenters.Add("name", CanopyGridPresenter.Progress());
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Reporting.Presenters["name"] = CanopyGridPresenter.Link("missing");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.Icon(" "));
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.List(""));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.List(",", 17));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Progress(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Progress(0));
    }
}
