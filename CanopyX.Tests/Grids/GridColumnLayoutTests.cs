using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnLayoutTests {
    [Fact]
    public void ReportingLayout_WritesBoundedPoliciesAndSelectsOptionalRuntime() {
        var view = new CanopyGridView("columns", "Column layout") { Reporting = new CanopyGridReporting { ColumnReorder = true } };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 180 });
        view.Reporting.Layout.Add("name", new CanopyGridColumnLayout(120, 800, 2));
        ProtocolSchema.AssertValid(view.ToJson(), "reporting layout");
        using var document = JsonDocument.Parse(view.ToJson());
        var reporting = document.RootElement.GetProperty("reporting");
        Assert.True(reporting.GetProperty("columnReorder").GetBoolean());
        var layout = reporting.GetProperty("layout").GetProperty("name");
        Assert.Equal(120, layout.GetProperty("minimum").GetInt32());
        Assert.Equal(800, layout.GetProperty("maximum").GetInt32());
        Assert.Equal(2, layout.GetProperty("flex").GetDouble());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Contains("200 loaded rows", view.Labels.GridResizeHelp);
    }

    [Fact]
    public void LayoutBindings_RejectUnknownColumnsOutOfBoundsInitialWidthsAndInvalidWeights() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(39));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(120, 100));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(flex: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(flex: 101));
        var view = new CanopyGridView("bad-layout", "Invalid layout") { Reporting = new CanopyGridReporting() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 160 });
        view.Reporting.Layout.Add("unknown", new CanopyGridColumnLayout());
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Reporting.Layout.Clear(); view.Reporting.Layout.Add("name", new CanopyGridColumnLayout(180));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
