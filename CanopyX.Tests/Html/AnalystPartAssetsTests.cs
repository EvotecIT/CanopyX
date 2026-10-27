using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class AnalystPartAssetsTests {
    [Theory]
    [InlineData("buckets", 2048)]
    [InlineData("values", 2560)]
    // Shared role expressions and overlay lifecycle add 74 compressed bytes; allow one 128-byte increment.
    [InlineData("pivot", 12416)]
    [InlineData("calculations", 7168)]
    public void AnalystEngine_HasAnIndependentCompressedBudget(string name, int budget) {
        var part = CanopyHtmlAssets.GetPart(name);
        var bytes = Gzip(part.Script) + (part.Style == null ? 0 : Gzip(part.Style));
        Assert.True(bytes <= budget, name + " assets are " + bytes + " bytes gzip; the budget is " + budget + ".");
        Assert.True(part.IsShippedWith(CanopyRuntime.DataGrid));
        Assert.False(part.IsShippedWith(CanopyRuntime.TreeGrid));
    }

    private static long Gzip(string text) {
        using var output = new MemoryStream();
        using (var compressor = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(text); compressor.Write(bytes, 0, bytes.Length);
        }
        return output.Length;
    }
}
