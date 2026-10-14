using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

public sealed class ExportPartAssetsTests {
    [Fact]
    public void ExportPart_IsVersionedInlineSafeAndBounded() {
        Assert.Matches("^[a-f0-9]{16}$", CanopyHtmlAssets.ExportVersion);
        Assert.Contains(CanopyHtmlAssets.ExportVersion, CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid));
        Assert.Contains(CanopyHtmlAssets.HashedExportScriptFileName, CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid));
        Assert.DoesNotContain("</script", CanopyHtmlAssets.ExportScript, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', CanopyHtmlAssets.ExportScript);
        Assert.True(Gzip(CanopyHtmlAssets.ExportScript) <= 8 * 1024, "The export part is " + Gzip(CanopyHtmlAssets.ExportScript) + " bytes gzip; the budget is 8 KiB.");
        var view = new CanopyDataGridView("grid", "Grid"); view.Columns.Add(new CanopyColumn("name", "Name"));
        var fragment = view.ToHtmlFragment();
        Assert.Contains("<script type=\"application/x-canopyx-export\" data-cx-version=\"" + CanopyHtmlAssets.ExportVersion + "\">", fragment);
    }

    [Fact]
    public void ExportPart_CarriesEveryExportSourcePart() {
        var root = RepositoryPaths.Root;
        var parts = System.Text.Json.JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "Build", "export-parts.json")))!;
        Assert.NotEmpty(parts);
        foreach (var part in parts) {
            var path = Path.Combine(root, part);
            Assert.True(File.Exists(path), "Missing export part " + part);
            var signature = File.ReadAllLines(path).Select(line => line.Trim()).First(line => line.StartsWith("Object.assign(", StringComparison.Ordinal) || line.StartsWith("function ", StringComparison.Ordinal) || line.StartsWith("DataGrid.prototype.", StringComparison.Ordinal));
            Assert.Contains(signature.Replace(" ", string.Empty), CanopyHtmlAssets.ExportScript.Replace(" ", string.Empty));
            Assert.DoesNotContain(signature.Replace(" ", string.Empty), CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid).Replace(" ", string.Empty));
        }
        // Tree captures ship in the tree tools part and their writers in the export part, which trees load on first use.
        Assert.Contains("treeRows", CanopyHtmlAssets.TreeToolsScript);
        Assert.Contains("treeRows", CanopyHtmlAssets.ExportScript);
        Assert.Contains(CanopyHtmlAssets.HashedExportScriptFileName, CanopyHtmlAssets.TreeToolsScript);
        Assert.DoesNotContain("function saveExport", CanopyHtmlAssets.TreeToolsScript);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid })
            Assert.DoesNotContain("treeRows", CanopyHtmlAssets.GetScript(runtime));
    }

    [Theory]
    [InlineData(CanopyAssetNaming.Plain)]
    [InlineData(CanopyAssetNaming.ContentHash)]
    public void AssetWriters_WriteTheExportPartBesideEveryRuntime(CanopyAssetNaming naming) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-export-part-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory, naming, CanopyRuntime.ReportingGrid);
            Assert.Equal(2, files.Count);
            var name = naming == CanopyAssetNaming.Plain ? CanopyHtmlAssets.ExportScriptFileName : CanopyHtmlAssets.HashedExportScriptFileName;
            Assert.Equal(CanopyHtmlAssets.ExportScript, File.ReadAllText(Path.Combine(directory, name)));
            var tree = Path.Combine(directory, "tree");
            CanopyHtmlAssets.WriteTo(tree, naming, CanopyRuntime.InteractiveTreeGrid);
            Assert.Equal(CanopyHtmlAssets.ExportScript, File.ReadAllText(Path.Combine(tree, name)));
        } finally { Directory.Delete(directory, true); }
    }

    private static long Gzip(string value) {
        using var output = new MemoryStream(); using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) { var bytes = Encoding.UTF8.GetBytes(value); gzip.Write(bytes, 0, bytes.Length); }
        return output.Length;
    }
}
