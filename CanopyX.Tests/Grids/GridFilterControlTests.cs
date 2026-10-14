using CanopyX.Html;
using CanopyX.Tests.Protocol;
using System.Text.Json;
using Xunit;

namespace CanopyX.Tests.Grids;

public sealed class GridFilterControlTests {
    [Fact]
    public void HeaderControlsAndTranslations_SelectTheRuntimeAndKeepTheProtocolTyped() {
        var grid = new CanopyDataGridView("filters", "Filtered inventory") { Reporting = new CanopyGridReporting { HeaderFilters = true } };
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Labels.GridHeaderFilter = "Filtruj {column}";
        grid.Labels.GridBetween = "pomiędzy";
        var json = grid.ToJson();
        ProtocolSchema.AssertValid(json, "reporting filter controls");
        using var document = JsonDocument.Parse(json);
        Assert.True(document.RootElement.GetProperty("reporting").GetProperty("headerFilters").GetBoolean());
        Assert.Equal("Filtruj {column}", document.RootElement.GetProperty("labels").GetProperty("gridHeaderFilter").GetString());
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(grid));
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Labels.GridHeaderFilter = "Filtruj {column}";
        // A tree never reads the flat grid's filter labels: it leaves them out and keeps the runtime the host chose.
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(tree, CanopyRuntime.DataGrid));
        Assert.DoesNotContain("gridHeaderFilter", tree.ToJson());
        grid.Reporting = null;
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(grid));
    }
}
