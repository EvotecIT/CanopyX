using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
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

        var expected = WithoutCommentLines(string.Join("\n", parts) + "\n");
        const string marker = "__CANOPYX_FOLD_PAIRS__";
        Assert.Contains(marker, expected);
        var tableSource = File.ReadAllText(Path.Combine(root, "CanopyX", "Search", "CanopySearchFoldingTable.cs"));
        var start = tableSource.IndexOf("internal const string LowercasePairs =", StringComparison.Ordinal);
        Assert.True(start >= 0, "The canonical search folding table is missing.");
        var end = tableSource.IndexOf(';', start);
        Assert.True(end > start, "The canonical search folding table is incomplete.");
        var pieces = Regex.Matches(tableSource.Substring(start, end - start), "\"([A-Za-z0-9+/=]+)\"");
        var encoded = string.Concat(pieces.Cast<Match>().Select(match => match.Groups[1].Value));
        Assert.NotEmpty(encoded);
        expected = expected.Replace(marker, encoded);

        Assert.True(parts.Length >= 3, "The runtime should be split into source parts.");
        Assert.True(expected == Normalize(CanopyHtmlAssets.Script), "canopyx.js is out of date. Run Build/Sync-Assets.ps1.");
    }

    [Fact]
    public void Assets_StayWithinTheCompressedBudget() {
        var compressed = GzipLength(CanopyHtmlAssets.Script) + GzipLength(CanopyHtmlAssets.Style);

        Assert.True(compressed <= 48 * 1024, "Runtime assets are " + compressed + " bytes gzip; the budget is 48 KB.");
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

            Assert.Equal(new[] { CanopyHtmlAssets.HashedScriptFileName, CanopyHtmlAssets.HashedStyleFileName }, files.Select(Path.GetFileName));
            Assert.Equal(CanopyHtmlAssets.Script, File.ReadAllText(files[0]));
            Assert.Equal(CanopyHtmlAssets.Style, File.ReadAllText(files[1]));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void HashedNames_CarryTheHashOfTheBytesWritten() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            // A file an older build left behind: pages written by that build still reference it.
            Directory.CreateDirectory(directory);
            var older = Path.Combine(directory, "canopyx.0123456789abcdef.js");
            File.WriteAllText(older, "older runtime");

            var files = CanopyHtmlAssets.WriteTo(directory);

            Assert.Matches("^[0-9a-f]{16}$", CanopyHtmlAssets.ScriptHash);
            Assert.Equal("canopyx." + CanopyHtmlAssets.ScriptHash + ".js", Path.GetFileName(files[0]));
            Assert.Equal("canopyx." + CanopyHtmlAssets.StyleHash + ".css", Path.GetFileName(files[1]));
            // A host that names or caches by the hash can check it against the file it serves.
            Assert.Equal(CanopyHtmlAssets.ScriptHash, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(files[0]))).ToLowerInvariant().Substring(0, 16));
            Assert.Equal(CanopyHtmlAssets.StyleHash, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(files[1]))).ToLowerInvariant().Substring(0, 16));
            Assert.Equal("older runtime", File.ReadAllText(older));
            // The hash belongs to the source, not to the line endings of the checkout the package was built from.
            Assert.DoesNotContain('\r', CanopyHtmlAssets.Script + CanopyHtmlAssets.Style);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void HashedFiles_AreNotRewrittenButADamagedOneIsReplaced() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory);
            var written = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            File.SetLastWriteTimeUtc(files[0], written);
            File.WriteAllText(files[1], "truncated");

            // A server may be reading the file: the same content under the same name is left as it is.
            CanopyHtmlAssets.WriteTo(directory);

            Assert.Equal(written, File.GetLastWriteTimeUtc(files[0]));
            Assert.Equal(CanopyHtmlAssets.Style, File.ReadAllText(files[1]));
            Assert.Equal(2, Directory.GetFiles(directory).Length);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void PlainNaming_WritesAndReferencesTheFixedNames() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyView("v", "Files");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain };

            var files = CanopyHtmlAssets.WriteTo(directory, options.AssetNaming);
            var page = view.ToHtmlPage(options);

            Assert.Equal(new[] { "canopyx.js", "canopyx.css" }, files.Select(Path.GetFileName));
            Assert.Contains("<link rel=\"stylesheet\" href=\"assets/canopyx.css\">", page);
            Assert.Contains("<script src=\"assets/canopyx.js\" defer></script>", page);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Script_ShipsWithoutTheCommentsOfItsSourceParts() {
        var script = Normalize(CanopyHtmlAssets.Script);
        var lines = script.Split('\n');

        // The header that says what the file is stays; the documentation of the parts does not ship.
        Assert.StartsWith("/*\n * CanopyX browser runtime", script);
        Assert.DoesNotContain(lines, line => line.TrimStart().StartsWith("//", StringComparison.Ordinal));
        Assert.Single(lines, line => line.TrimStart().StartsWith("/*", StringComparison.Ordinal));
    }

    /// <summary>The comment stripping of Build/Sync-Assets.ps1: whole // lines and /* */ blocks, except the first block.</summary>
    private static string WithoutCommentLines(string content) {
        var kept = new List<string>();
        var inBlock = false;
        var header = content.StartsWith("/*", StringComparison.Ordinal);
        foreach (var line in content.Split('\n')) {
            var text = line.Trim();
            if (inBlock || text.StartsWith("/*", StringComparison.Ordinal)) {
                var end = text.IndexOf("*/", inBlock ? 0 : 2, StringComparison.Ordinal);
                Assert.True(end < 0 || end + 2 == text.Length, "Code shares a line with a comment: " + text);
                inBlock = end < 0;
                if (header) {
                    kept.Add(line);
                    header = inBlock;
                }

                continue;
            }

            if (text.StartsWith("//", StringComparison.Ordinal)) {
                continue;
            }

            var opens = text.IndexOf("/*", StringComparison.Ordinal);
            Assert.False(text.Contains('`') || text.EndsWith('\\') || (opens > 0 && text.IndexOf("*/", opens, StringComparison.Ordinal) < 0),
                "A line the comment rule could misread: " + text);
            kept.Add(text);
        }

        return string.Join("\n", kept);
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
