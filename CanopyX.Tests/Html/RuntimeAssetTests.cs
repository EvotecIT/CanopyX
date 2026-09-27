using System.IO.Compression;
using System.Text;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>
/// The runtime ships as embedded native assets. The assembled script must match its source parts, fit the size
/// budget in docs/architecture.md, and be safe to inline into a page.
/// </summary>
public sealed class RuntimeAssetTests {
    [Fact]
    public void Script_MatchesItsSourceParts() {
        var root = RepositoryPaths.Root;
        var parts = Directory.EnumerateFiles(Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.source"), "*.js")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .Select(part => Normalize(File.ReadAllText(part)).TrimEnd('\n'))
            .ToArray();

        var expected = string.Join("\n", parts) + "\n";

        Assert.True(parts.Length >= 3, "The runtime should be split into source parts.");
        Assert.True(expected == Normalize(CanopyHtmlAssets.Script), "canopyx.js is out of date. Run Build/Sync-Assets.ps1.");
    }

    [Fact]
    public void Assets_StayWithinTheCompressedBudget() {
        var compressed = GzipLength(CanopyHtmlAssets.Script) + GzipLength(CanopyHtmlAssets.Style);

        Assert.True(compressed <= 40 * 1024, "Runtime assets are " + compressed + " bytes gzip; the budget is 40 KB.");
    }

    [Fact]
    public void Assets_CanBeInlinedIntoAPage() {
        Assert.DoesNotContain("</script", CanopyHtmlAssets.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</style", CanopyHtmlAssets.Style, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void WriteTo_WritesScriptAndStyle() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory);

            Assert.Equal(new[] { CanopyHtmlAssets.ScriptFileName, CanopyHtmlAssets.StyleFileName }, files.Select(Path.GetFileName));
            Assert.Equal(CanopyHtmlAssets.Script, File.ReadAllText(files[0]));
            Assert.Equal(CanopyHtmlAssets.Style, File.ReadAllText(files[1]));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static string Normalize(string value) => value.Replace("\r\n", "\n").Replace("\r", "\n");

    private static long GzipLength(string value) {
        using var buffer = new MemoryStream();
        using (var gzip = new GZipStream(buffer, CompressionLevel.SmallestSize, leaveOpen: true)) {
            var bytes = Encoding.UTF8.GetBytes(value);
            gzip.Write(bytes, 0, bytes.Length);
        }

        return buffer.Length;
    }
}
