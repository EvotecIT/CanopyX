using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class FilterEditorAssetsTests {
    [Fact]
    public void OptionalEditor_IsVersionedInlineSafeAndBounded() {
        Assert.Matches("^[a-f0-9]{16}$", CanopyHtmlAssets.FilterEditorVersion);
        Assert.Contains(CanopyHtmlAssets.FilterEditorVersion, CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid));
        Assert.DoesNotContain("</script", CanopyHtmlAssets.FilterEditorScript, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</script", CanopyHtmlAssets.FilterEditorStyle, StringComparison.OrdinalIgnoreCase);
        // Raised from 16 KiB with the generalised record drawer (field fidelity, record panel hooks, drawer: false).
        var size = Gzip(CanopyHtmlAssets.FilterEditorScript) + Gzip(CanopyHtmlAssets.FilterEditorStyle);
        Assert.True(size <= 19968, "The filter editor part is " + size + " bytes gzip; the guard is 19.5 KiB.");
        var view = new CanopyDataGridView("grid", "Grid"); view.Columns.Add(new CanopyColumn("name", "Name"));
        var fragment = view.ToHtmlFragment(); Assert.Contains("application/x-canopyx-filter-editor", fragment); Assert.Contains(CanopyHtmlAssets.FilterEditorVersion, fragment);
    }
    [Fact]
    public void ExternalGridAssets_WriteMatchingCompanionsWithoutChangingReturnedMainPaths() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-filter-editor-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory, CanopyAssetNaming.ContentHash, CanopyRuntime.DataGrid);
            Assert.Equal(2, files.Count);
            Assert.Equal(CanopyHtmlAssets.FilterEditorScript, File.ReadAllText(Path.Combine(directory, CanopyHtmlAssets.HashedFilterEditorScriptFileName)));
            Assert.Equal(CanopyHtmlAssets.FilterEditorStyle, File.ReadAllText(Path.Combine(directory, CanopyHtmlAssets.HashedFilterEditorStyleFileName)));
        } finally { Directory.Delete(directory, true); }
    }
    private static long Gzip(string value) {
        using var output = new MemoryStream(); using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
