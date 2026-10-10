using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnLayoutTests {
    [Fact]
    public void ReportingLayout_WritesBoundedPoliciesAndSelectsOptionalRuntime() {
        var view = new CanopyDataGridView("columns", "Column layout") { Reporting = new CanopyGridReporting { ColumnReorder = true } };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(180) });
        view.GetColumn("name").Sizing = CanopyColumnSizing.Flex(2, 120, 800, view.GetColumn("name").Sizing.Width);
        ProtocolSchema.AssertValid(view.ToJson(), "reporting layout");
        using var document = JsonDocument.Parse(view.ToJson());
        var reporting = document.RootElement.GetProperty("reporting");
        Assert.True(reporting.GetProperty("columnReorder").GetBoolean());
        var layout = document.RootElement.GetProperty("columns")[0];
        Assert.Equal(120, layout.GetProperty("minWidth").GetInt32());
        Assert.Equal(800, layout.GetProperty("maxWidth").GetInt32());
        Assert.Equal(2, layout.GetProperty("flex").GetDouble());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Contains("200 loaded rows", view.Labels.GridResizeHelp);
    }

    [Fact]
    public void SizingRejectsContradictoryBoundsAndInvalidWeightsAtConstruction() {
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Content(39));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Content(120, 100));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Flex(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Flex(101));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Preferred(160, 180));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyColumnSizing.Fixed(39));
    }
}
