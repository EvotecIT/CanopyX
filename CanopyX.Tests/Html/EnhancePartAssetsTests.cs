using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>
/// The pager controls and the table enhancement ship as parts of the grid entry points: versioned, bounded, outside the
/// entry points, and written beside them. Only views with pager settings carry the pager payload; no view carries the
/// enhancement, which page code loads with CanopyX.enhance or CanopyX.grid.
/// </summary>
public sealed class EnhancePartAssetsTests {
    [Fact]
    public void PagerPart_IsBoundedStyledAndOutsideTheEntryPoints() {
        var part = CanopyHtmlAssets.GetPart("pager");
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.Contains("function pagerWindow(", part.Script);
        Assert.Contains(".cx-pages", part.Style);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function pagerWindow(", script);
            Assert.Contains("GRID_PAGER=definePart(DataGrid,\"pager\"", script);
        }
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(Gzip(part.Script) <= 3072, "The pager part is " + Gzip(part.Script) + " bytes gzip; the guard is 3 KiB.");
        Assert.True(Gzip(part.Style!) <= 512, "The pager stylesheet is " + Gzip(part.Style!) + " bytes gzip; the guard is 0.5 KiB.");
    }

    [Fact]
    public void EnhancePart_IsBoundedStylesheetFreeAndNeverEmbedded() {
        var part = CanopyHtmlAssets.GetPart("enhance");
        // It loads the pager part itself once a table has left the page, and styles the kept caption and footer in place.
        Assert.Empty(part.Requires);
        Assert.Null(part.Style);
        Assert.Contains("await loadPart(GRID_PAGER)", part.Script);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.Contains("function enhanceReadTable(", part.Script);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.DoesNotContain("function enhanceReadTable(", script);
            Assert.Contains("enhance:gridEnhancer(true),grid:gridEnhancer(false)", script);
        }
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid }) Assert.DoesNotContain("gridEnhancer", CanopyHtmlAssets.GetScript(runtime));
        var grid = new CanopyDataGridView("grid", "Grid") { Presentation = CanopyGridPresentation.Paged };
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        grid.Pager.PageNumbers = 7;
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(grid), item => item.Name == "enhance");
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(Gzip(part.Script) <= 14848, "The enhance part is " + Gzip(part.Script) + " bytes gzip; the guard is 14.5 KiB.");
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void GridAssetWriters_WriteBothPartsBesideTheRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-enhance-part-" + Guid.NewGuid().ToString("N"));
        try {
            CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.DataGrid);
            foreach (var name in new[] { "pager", "enhance" }) {
                var part = CanopyHtmlAssets.GetPart(name);
                Assert.Equal(part.Script, File.ReadAllText(Path.Combine(directory, part.GetScriptFileName(naming))));
                if (part.Style != null) Assert.Equal(part.Style, File.ReadAllText(Path.Combine(directory, part.GetStyleFileName(naming)!)));
            }
            var tree = Path.Combine(directory, "tree");
            CanopyHtmlAssets.WriteTo(tree, naming, CanopyRuntime.TreeGrid);
            Assert.Empty(Directory.GetFiles(tree, "canopyx-enhance*"));
            Assert.Empty(Directory.GetFiles(tree, "canopyx-pager*"));
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
