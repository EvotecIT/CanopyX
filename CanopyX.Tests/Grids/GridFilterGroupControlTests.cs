using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridFilterGroupControlTests {
    [Fact]
    public void GroupEditor_SerializesItsPolicyAndTranslatedControlsInTheReportingDocument() {
        var view = new CanopyDataGridView("inventory", "Inventory") {
            Reporting = new CanopyGridReporting { FilterGroups = true, HeaderFilters = true }
        };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Labels.GridFilterAll = "Every condition";
        view.Labels.GridFilterAny = "One or more conditions";
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "group editor");
        using var document = JsonDocument.Parse(json);
        Assert.True(document.RootElement.GetProperty("reporting").GetProperty("filterGroups").GetBoolean());
        Assert.Equal("Every condition", document.RootElement.GetProperty("labels").GetProperty("gridFilterAll").GetString());
        Assert.Equal("One or more conditions", document.RootElement.GetProperty("labels").GetProperty("gridFilterAny").GetString());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        view.Reporting = null;
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
    }
}
