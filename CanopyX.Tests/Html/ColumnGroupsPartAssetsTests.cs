using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Column groups and cell ranges ship as parts: versioned, inline-safe, bounded, outside the entry points and written beside the grid runtimes.</summary>
public sealed class ColumnGroupsPartAssetsTests {
    [Theory]
    [InlineData("column-groups", "function cgHeader", 8704)]
    [InlineData("cell-range", "function crPaint", 15 * 1024)]
    public void Part_IsVersionedInlineSafeBoundedAndOutsideTheEntryPoints(string name, string marker, int budget) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Contains(marker, part.Script);
        Assert.NotNull(part.Style);
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains(part.Version, script);
            Assert.DoesNotContain(marker, script);
            Assert.Contains(part, CanopyHtmlAssets.GetParts(runtime));
        }
        Assert.DoesNotContain(part, CanopyHtmlAssets.GetParts(CanopyRuntime.TreeGrid));
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', part.Script);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        Assert.True(size <= budget, "The " + name + " part is " + size + " bytes gzip; the guard is " + budget + " bytes.");
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void GridAssetWriters_WriteBothPartsBesideTheRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-range-parts-" + Guid.NewGuid().ToString("N"));
        try {
            CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.DataGrid);
            foreach (var name in new[] { "column-groups", "cell-range" }) {
                var part = CanopyHtmlAssets.GetPart(name);
                Assert.Equal(part.Script, File.ReadAllText(Path.Combine(directory, part.GetScriptFileName(naming))));
                Assert.Equal(part.Style, File.ReadAllText(Path.Combine(directory, part.GetStyleFileName(naming)!)));
            }
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
