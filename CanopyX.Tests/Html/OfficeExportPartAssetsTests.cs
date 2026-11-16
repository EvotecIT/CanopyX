using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Offline document writers remain optional, inert payloads outside every entry point.</summary>
public sealed class OfficeExportPartAssetsTests {
    [Fact]
    public void OfficeWriters_AreSeparateInlineSafeAndKeepTheirLicense() {
        var part = CanopyHtmlAssets.GetPart("office-export");
        Assert.Matches("^[a-f0-9]{16}$", part.Version);
        Assert.Contains("OfficeIMO.exportCanopy", part.Script);
        // The shared core carries every writer; the CanopyX adapter takes its modules from it.
        Assert.Contains("@evotecit/officeimo/modules", part.Script);
        Assert.Contains("Permission is hereby granted, free of charge", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('\r', part.Script);
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(part.Script); gzip.Write(bytes, 0, bytes.Length);
        }
        Assert.True(output.Length <= 132 * 1024, "The optional OfficeIMO core and CanopyX adapter exceed their 132 KiB gzip budget.");
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.DoesNotContain("OfficeIMO.exportCanopy", ReadableAssets.Script(runtime));
            Assert.Contains(part.HashedScriptFileName, CanopyHtmlAssets.GetScript(runtime));
        }
    }

    [Fact]
    public void CsvWriter_IsASeparateSmallPartBesideEveryRuntime() {
        var part = CanopyHtmlAssets.GetPart("csv-export");
        Assert.Contains("OfficeIMO.csv.writeCsv", part.Script);
        Assert.Contains("Permission is hereby granted, free of charge", part.Script);
        Assert.DoesNotContain("</script", part.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("exportCanopy", part.Script);
        Assert.True(Gzip(part.Script) <= 13 * 1024, "The CSV writer part is " + Gzip(part.Script) + " bytes gzip; the budget is 13 KiB.");
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid }) {
            Assert.DoesNotContain("OfficeIMO.csv", ReadableAssets.Script(runtime));
            Assert.Contains(part.HashedScriptFileName, CanopyHtmlAssets.GetScript(runtime));
        }
    }

    [Fact]
    public void VendoredBundles_MatchTheirRecordedHashes() {
        var folder = Path.Combine(RepositoryPaths.Root, "ThirdParty", "OfficeIMO");
        var recorded = Regex.Matches(File.ReadAllText(Path.Combine(folder, "README.md")), @"^\| `(?<file>[^`]+\.js)` \| `(?<hash>[a-f0-9]{64})` \|\r?$", RegexOptions.Multiline)
            .ToDictionary(match => match.Groups["file"].Value, match => match.Groups["hash"].Value);
        Assert.Equal(Directory.GetFiles(folder, "*.js").Select(Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal), recorded.Keys.OrderBy(name => name, StringComparer.Ordinal));
        foreach (var (file, hash) in recorded) {
            using var stream = File.OpenRead(Path.Combine(folder, file));
            Assert.True(hash == Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant(), file + " differs from the bundle recorded in ThirdParty/OfficeIMO/README.md.");
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

    private static long Gzip(string script) {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, true)) {
            var bytes = Encoding.UTF8.GetBytes(script); gzip.Write(bytes, 0, bytes.Length);
        }
        return output.Length;
    }
}
