using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

public sealed class GridExportFormatTests {
    [Fact]
    public void ExportFormats_AreDeclaredIdentitiesInOrderAndOptional() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("exportFormats", view.ToJson());
        view.ExportFormats.Add("xlsx");
        view.ExportFormats.Add("pdf");
        view.ExportFormats.Add("open-document-2");
        var json = view.ToJson();
        Assert.Contains("\"exportFormats\":[\"xlsx\",\"pdf\",\"open-document-2\"]", json);
        ProtocolSchema.AssertValid(json, "declared export formats");
        // Declaring formats needs no reporting capability: the ordinary grid runtime lists them too.
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
    }

    [Theory]
    [InlineData("")]
    [InlineData("Xlsx")]
    [InlineData("1pdf")]
    [InlineData("x_y")]
    [InlineData("abcdefghijklmnopqrstuvwxyzabcdefg")]
    [InlineData("csv")]
    public void ExportFormats_RejectInvalidIdentities(string format) {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.ExportFormats.Add(format);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void ExportFormats_RejectDuplicatesAndTheSchemaAgrees() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.ExportFormats.Add("pdf");
        var json = view.ToJson();
        view.ExportFormats.Add("pdf");
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["exportFormats"] = System.Text.Json.Nodes.JsonNode.Parse("[\"pdf\",\"pdf\"]"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["exportFormats"] = System.Text.Json.Nodes.JsonNode.Parse("[\"PDF\"]"))).IsValid);
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["exportFormats"] = System.Text.Json.Nodes.JsonNode.Parse("[\"csv\"]"))).IsValid);
        Assert.True(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, node => node["exportFormats"] = System.Text.Json.Nodes.JsonNode.Parse("[]"))).IsValid);
    }

    [Fact]
    public void ExportProgressLabels_NoLongerRequireTheReportingRuntime() {
        var view = new CanopyDataGridView("records", "Records");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Labels.GridCancelExport = "Stop export";
        view.Labels.GridExportProgress = "{completed}/{total}";
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Contains("Stop export", view.ToJson());
    }

    [Fact]
    public void TreePages_CarryTheExportPartInline() {
        // Every tree runtime loads the export part for a tree's Export menu and exports, so single-file tree pages carry it.
        var tree = new CanopyTreeView("files", "Files") { Labels = CanopyLabels.Polish() };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, CanopyHtmlAssets.GetRuntime(tree));
        Assert.Contains("application/x-canopyx-export", tree.ToHtmlPage());
        Assert.Contains("application/x-canopyx-export", tree.ToHtmlPage(new CanopyHtmlOptions { Runtime = CanopyRuntime.DataGrid }));
        Assert.Contains("application/x-canopyx-export", tree.ToHtmlFragment(new CanopyHtmlOptions { Runtime = CanopyRuntime.ReportingGrid }));
        var plain = new CanopyTreeView("plain", "Plain");
        plain.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.Contains("application/x-canopyx-export", plain.ToHtmlPage());
        Assert.Contains("application/x-canopyx-export", plain.ToHtmlPage(new CanopyHtmlOptions { Runtime = CanopyRuntime.InteractiveTreeGrid }));
        Assert.Contains("application/x-canopyx-export", plain.ToHtmlPage(new CanopyHtmlOptions { Runtime = CanopyRuntime.ReportingGrid }));
        Assert.DoesNotContain("application/x-canopyx-export", plain.ToHtmlPage(new CanopyHtmlOptions { Runtime = CanopyRuntime.ReportingGrid, AssetMode = CanopyAssetMode.External }));
    }
}
