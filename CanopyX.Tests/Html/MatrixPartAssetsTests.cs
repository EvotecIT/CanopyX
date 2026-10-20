using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>The matrix part: its size guard, where it ships, and what a matrix page embeds.</summary>
public sealed class MatrixPartAssetsTests {
    [Fact]
    public void MatrixPart_IsVersionedInlineSafeAndBounded() {
        var part = CanopyHtmlAssets.GetPart("matrix");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Equal(new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }, part.Runtimes);
        Assert.Empty(part.Requires);
        Assert.NotNull(part.Style);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        var size = Gzip(part.Script) + Gzip(part.Style!);
        // Matrix wave M1: 24,009 bytes plus about 15%, rounded up to KiB.
        Assert.True(size <= 27 * 1024, "The matrix part is " + size + " bytes gzip; the guard is 27 KiB.");
    }

    [Fact]
    public void GridEntryPoints_CarryTheShellAndTheTreeEntryPointDoesNot() {
        foreach (var runtime in new[] { CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            var script = CanopyHtmlAssets.GetScript(runtime);
            Assert.Contains("createMatrix", script);
            Assert.Contains("class AxisWindow", script);
            Assert.DoesNotContain("class MatrixView", script);
        }

        Assert.DoesNotContain("createMatrix(", CanopyHtmlAssets.GetScript(CanopyRuntime.TreeGrid));
        Assert.DoesNotContain("class AxisWindow", CanopyHtmlAssets.GetScript(CanopyRuntime.TreeGrid));
    }

    [Fact]
    public void MatrixPage_EmbedsOnlyTheMatrixPayload() {
        var matrix = new CanopyMatrix("m", "M");
        matrix.State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        matrix.Rows.Item("a", "A"); matrix.Columns.Item("x", "X");
        matrix.Set("a", "x", "ok");
        var page = matrix.ToHtmlPage();
        var embedded = CanopyHtmlAssets.Parts.Where(part => page.Contains("type=\"application/x-canopyx-" + part.Name + "\"", StringComparison.Ordinal)).Select(part => part.Name);
        Assert.Equal(new[] { "matrix" }, embedded);
        Assert.Contains("type=\"application/x-canopyx-matrix-style\"", page);
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
