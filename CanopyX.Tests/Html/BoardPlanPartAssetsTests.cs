using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class BoardPlanPartAssetsTests {
    [Theory]
    [InlineData("board", 8192)]
    // Canonical role fallbacks add 12 measured gzip bytes; keep a bounded 64-byte allowance.
    [InlineData("plan", 12288 + 64)]
    public void LayoutPart_StaysOptionalVersionedAndWithinItsGzipBudget(string name, int budget) {
        var part = CanopyHtmlAssets.GetPart(name);
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        Assert.True(size <= budget, name + " uses " + size + " bytes gzip and exceeds its optional-part budget.");
        var plain = new CanopyDataGridView("records", "Records"); plain.Columns.Add(new CanopyColumn("title", "Title"));
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(plain), item => item.Name == name);
        if (name == "board") {
            Assert.Empty(part.Requires);
            plain.Board = new CanopyBoard("title");
            Assert.Contains(CanopyHtmlAssets.GetRequiredParts(plain), item => item.Name == "board");
            Assert.Contains("application/x-canopyx-board", plain.ToHtmlPage());
            Assert.DoesNotContain("application/x-canopyx-plan", plain.ToHtmlPage());
        } else Assert.Contains("timeline", part.Requires);
    }

    private static long Gzip(string value) {
        using var stream = new MemoryStream();
        using (var gzip = new GZipStream(stream, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes); }
        return stream.Length;
    }
}
