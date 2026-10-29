using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Offline document writers remain optional, inert payloads outside every entry point.</summary>
public sealed class OfficeExportPartAssetsTests {
    [Fact]
    public void OfficeWriters_AreSeparateInlineSafeAndKeepTheirLicense() {
        var part = CanopyHtmlAssets.GetPart("office-export");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Contains("OfficeIMO.exportCanopy", part.Script);
        Assert.Contains("Permission is hereby granted, free of charge", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', part.Script);
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(part.Script); gzip.Write(bytes, 0, bytes.Length);
        }
        Assert.True(output.Length <= 128 * 1024, "The optional Office writer exceeds its 128 KiB gzip budget.");
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.DoesNotContain("OfficeIMO.exportCanopy", CanopyHtmlAssets.GetScript(runtime));
            Assert.Contains(part.HashedScriptFileName, CanopyHtmlAssets.GetScript(runtime));
        }
    }

    [Fact]
    public void SingleFilePages_CarryOfficePayloadOnlyAfterOptIn() {
        var grid = new CanopyDataGridView("costs", "Costs"); grid.Columns.Add(new CanopyColumn("name", "Resource"));
        Assert.DoesNotContain("application/x-canopyx-office-export", grid.ToHtmlFragment());
        grid.ExportFormats = CanopyExportFormats.Office();
        Assert.Contains("application/x-canopyx-office-export", grid.ToHtmlFragment());
        Assert.DoesNotContain("application/x-canopyx-office-export", grid.ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External }));
        var tree = new CanopyTreeView("outline", "Outline"); tree.Columns.Add(new CanopyColumn("name", "Resource"));
        Assert.DoesNotContain("application/x-canopyx-office-export", tree.ToHtmlFragment());
        tree.ExportFormats = CanopyExportFormats.Office();
        Assert.Contains("application/x-canopyx-office-export", tree.ToHtmlFragment());
    }
}
