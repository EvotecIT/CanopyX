using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnPlacementTests {
    [Fact]
    public void PlacementPolicies_SerializeIntentAndValidateAgainstProtocolSchema() {
        var view = new CanopyDataGridView("placement", "Responsive report") {
            Reporting = new CanopyGridReporting { Responsive = true, MinimumCenterWidth = 160 }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(180) });
        view.Columns.Add(new CanopyColumn("actions", "Actions") { Sizing = CanopyColumnSizing.Preferred(100) });
        view.GetColumn("name").Sizing = view.GetColumn("name").Sizing.Width.HasValue ? CanopyColumnSizing.Preferred(view.GetColumn("name").Sizing.Width.GetValueOrDefault(), 120, 800) : CanopyColumnSizing.Content(120, 800);
        view.GetColumn("name").Pinned = CanopyGridColumnPin.Left;
        view.GetColumn("name").ResponsivePriority = 0;
        view.GetColumn("name").AlwaysVisible = true;
        view.GetColumn("actions").Sizing = view.GetColumn("actions").Sizing.Width.HasValue ? CanopyColumnSizing.Preferred(view.GetColumn("actions").Sizing.Width.GetValueOrDefault(), 40, 300) : CanopyColumnSizing.Content(40, 300);
        view.GetColumn("actions").Pinned = CanopyGridColumnPin.Right;
        view.GetColumn("actions").ResponsivePriority = 10;
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "column placement");
        using var document = JsonDocument.Parse(json);
        var reporting = document.RootElement.GetProperty("reporting");
        Assert.True(reporting.GetProperty("responsive").GetBoolean());
        Assert.Equal(160, reporting.GetProperty("minimumCenterWidth").GetInt32());
        var policy = document.RootElement.GetProperty("columns")[0];
        Assert.Equal("left", policy.GetProperty("pinned").GetString());
        Assert.Equal(0, policy.GetProperty("priority").GetInt32());
        Assert.True(policy.GetProperty("alwaysVisible").GetBoolean());
        Assert.Equal("right", document.RootElement.GetProperty("columns")[1].GetProperty("pinned").GetString());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Equal("{column}: pinned region", view.Labels.GridPinColumn);
    }

    [Fact]
    public void InvalidPlacementPoliciesAndCenterWidths_RejectBeforeSerialization() {
        var invalidPin = new CanopyDataGridView("pin", "Pin");
        invalidPin.Columns.Add(new CanopyColumn("name", "Name") { Pinned = (CanopyGridColumnPin)9 });
        Assert.Throws<InvalidOperationException>(() => invalidPin.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyColumn("name", "Name") { ResponsivePriority = -1 });
        var view = new CanopyDataGridView("bad-placement", "Invalid placement") { Reporting = new CanopyGridReporting { MinimumCenterWidth = 39 } };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Reporting.MinimumCenterWidth = 4097;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        var labels = new CanopyLabels { GridPinLeft = "Start" };
        Assert.True(labels.RequiresReportingRuntime);
    }
}
