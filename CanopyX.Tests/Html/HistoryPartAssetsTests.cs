using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>The status strip and the sparklines ship in the history part: versioned, bounded, and carried by the grids that draw them.</summary>
public sealed class HistoryPartAssetsTests {
    [Fact]
    public void HistoryPart_IsVersionedInlineSafeBoundedAndOutsideTheEntryPoints() {
        Assert.Matches("^[a-f0-9]{16}$", CanopyHtmlAssets.HistoryVersion);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains(CanopyHtmlAssets.HistoryVersion, script);
            Assert.Contains(CanopyHtmlAssets.HashedHistoryScriptFileName, script);
            Assert.DoesNotContain("function gridRenderHistory", script);
        }
        Assert.Contains("function gridRenderHistory", CanopyHtmlAssets.HistoryScript);
        Assert.DoesNotContain("</script", CanopyHtmlAssets.HistoryScript, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', CanopyHtmlAssets.HistoryScript);
        // Combined roadmap integration: its size plus about 15%.
        Assert.True(Gzip(CanopyHtmlAssets.HistoryScript) <= 2048, "The history part is " + Gzip(CanopyHtmlAssets.HistoryScript) + " bytes gzip; the guard is 2 KiB.");
    }

    [Fact]
    public void GridFragments_CarryThePayloadOnlyWhenTheyDrawHistory() {
        var plain = new CanopyDataGridView("plain", "Plain");
        plain.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("x-canopyx-history", plain.ToHtmlFragment());
        var trend = new CanopyDataGridView("trend", "Trend");
        trend.Columns.Add(new CanopyColumn("name", "Name"));
        trend.Columns.Add(new CanopyColumn("load", "Load") { Presenter = CanopyGridPresenter.StatusStrip() });
        Assert.Contains("<script type=\"application/x-canopyx-history\" data-cx-version=\"" + CanopyHtmlAssets.HistoryVersion + "\">", trend.ToHtmlFragment());
        Assert.DoesNotContain("x-canopyx-history", trend.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void GridAssetWriters_WriteTheHistoryPartBesideTheRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-history-part-" + Guid.NewGuid().ToString("N"));
        try {
            CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.DataGrid);
            var name = naming == CanopyAssetNaming.Plain ? CanopyHtmlAssets.HistoryScriptFileName : CanopyHtmlAssets.HashedHistoryScriptFileName;
            Assert.Equal(CanopyHtmlAssets.HistoryScript, File.ReadAllText(Path.Combine(directory, name)));
            var tree = Path.Combine(directory, "tree");
            CanopyHtmlAssets.WriteTo(tree, naming, CanopyRuntime.TreeGrid);
            Assert.Empty(Directory.GetFiles(tree, "canopyx-history*"));
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
