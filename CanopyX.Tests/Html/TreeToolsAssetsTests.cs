using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Every tree runtime loads the tree tools part; it must match its runtimes, stay bounded and travel with tree pages.</summary>
public sealed class TreeToolsAssetsTests {
    [Fact]
    public void TreeTools_AreVersionedInlineSafeAndBounded() {
        Assert.Matches("^[a-f0-9]{16}$", CanopyHtmlAssets.TreeToolsVersion);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.Contains(CanopyHtmlAssets.TreeToolsVersion, CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(CanopyHtmlAssets.HashedTreeToolsScriptFileName, CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(CanopyHtmlAssets.HashedTreeToolsStyleFileName, CanopyHtmlAssets.GetScript(runtime));
        }
        Assert.DoesNotContain("</script", CanopyHtmlAssets.TreeToolsScript, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</script", CanopyHtmlAssets.TreeToolsStyle, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', CanopyHtmlAssets.TreeToolsScript);
        var size = Gzip(CanopyHtmlAssets.TreeToolsScript) + Gzip(CanopyHtmlAssets.TreeToolsStyle);
        Assert.True(size <= 16 * 1024, "The tree tools part is " + size + " bytes gzip; the guard is 16 KiB.");
        // The shared chrome in this copy targets tree hosts only, so a flat grid's own rules keep their order on a mixed page.
        Assert.DoesNotContain(".cx-chrome", CanopyHtmlAssets.TreeToolsStyle);
        Assert.Contains(".cx-tree-tools", CanopyHtmlAssets.TreeToolsStyle);
    }

    [Fact]
    public void TreeFragments_CarryThePayloadOnlyWithInlineAssets() {
        var view = new CanopyTreeView("tree", "Tree");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var inline = view.ToHtmlFragment();
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", inline);
        Assert.Contains("<script type=\"application/x-canopyx-tree-tools-style\" data-cx-version=\"" + CanopyHtmlAssets.TreeToolsVersion + "\">", inline);
        Assert.DoesNotContain("x-canopyx-tree-tools", view.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        var grid = new CanopyDataGridView("grid", "Grid");
        grid.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("x-canopyx-tree-tools", grid.ToHtmlFragment());
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain, CanopyRuntime.TreeGrid)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyRuntime.InteractiveTreeGrid)]
    [InlineData(CanopyAssetNaming.ContentHash, CanopyRuntime.DataGrid)]
    public void AssetWriters_WriteTheTreeToolsBesideEveryRuntime(CanopyAssetNaming naming, CanopyRuntime runtime) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-tree-tools-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory, naming, runtime);
            Assert.Equal(2, files.Count);
            var plain = naming == CanopyAssetNaming.Plain;
            Assert.Equal(CanopyHtmlAssets.TreeToolsScript, File.ReadAllText(Path.Combine(directory, plain ? CanopyHtmlAssets.TreeToolsScriptFileName : CanopyHtmlAssets.HashedTreeToolsScriptFileName)));
            Assert.Equal(CanopyHtmlAssets.TreeToolsStyle, File.ReadAllText(Path.Combine(directory, plain ? CanopyHtmlAssets.TreeToolsStyleFileName : CanopyHtmlAssets.HashedTreeToolsStyleFileName)));
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
