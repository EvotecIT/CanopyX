using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;

namespace CanopyX.Tests.Grids;

public sealed class GridColumnPlacementTests {
    [Fact]
    public void PlacementPolicies_SerializeIntentAndValidateAgainstProtocolSchema() {
        var view = new CanopyGridView("placement", "Responsive report") {
            Reporting = new CanopyGridReporting { Responsive = true, MinimumCenterWidth = 160 }
        };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 180 });
        view.Columns.Add(new CanopyColumn("actions", "Actions") { Width = 100 });
        view.Reporting.Layout.Add("name", new CanopyGridColumnLayout(120, 800, pin: CanopyGridColumnPin.Left, priority: 0, alwaysVisible: true));
        view.Reporting.Layout.Add("actions", new CanopyGridColumnLayout(40, 300, pin: CanopyGridColumnPin.Right, priority: 10));
        var json = view.ToJson(); ProtocolSchema.AssertValid(json, "column placement");
        using var document = JsonDocument.Parse(json);
        var reporting = document.RootElement.GetProperty("reporting");
        Assert.True(reporting.GetProperty("responsive").GetBoolean());
        Assert.Equal(160, reporting.GetProperty("minimumCenterWidth").GetInt32());
        var policy = reporting.GetProperty("layout").GetProperty("name");
        Assert.Equal("left", policy.GetProperty("pin").GetString());
        Assert.Equal(0, policy.GetProperty("priority").GetInt32());
        Assert.True(policy.GetProperty("alwaysVisible").GetBoolean());
        Assert.Equal("right", reporting.GetProperty("layout").GetProperty("actions").GetProperty("pin").GetString());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Equal("{column}: pinned region", view.Labels.GridPinColumn);
    }

    [Fact]
    public void InvalidPlacementPoliciesAndCenterWidths_RejectBeforeSerialization() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(pin: (CanopyGridColumnPin)9));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyGridColumnLayout(priority: -1));
        var view = new CanopyGridView("bad-placement", "Invalid placement") { Reporting = new CanopyGridReporting { MinimumCenterWidth = 39 } };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        view.Reporting.MinimumCenterWidth = 4097;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        var labels = new CanopyLabels { GridPinLeft = "Start" };
        Assert.True(labels.RequiresReportingRuntime);
    }
}
