using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Tests.Bundles;

namespace CanopyX.Tests.Html;

/// <summary>
/// SaveHtmlBundle is the one call a host makes for large trees: it must leave a folder that works when copied to a file
/// share, with the page pointing at its sidecar data instead of carrying the tree inline.
/// </summary>
public sealed class BundlePageTests {
    [Theory]
    [InlineData("con/")]
    [InlineData("assets/aux/")]
    [InlineData("COM1.txt/")]
    public void ReservedAssetFoldersFailBeforeWriting(string assetPath) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-reserved-" + Guid.NewGuid().ToString("N"));
        var view = TestTrees.FileShares(shares: 1, foldersPerShare: 1, filesPerFolder: 1, bigFolder: 1);
        Assert.Throws<ArgumentException>(() => view.SaveHtmlBundle(directory, new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = assetPath }));
        Assert.False(Directory.Exists(directory));
    }

    [Fact]
    public void SaveHtmlBundle_WritesPageAssetsAndSidecarData() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-page-" + Guid.NewGuid().ToString("N"));
        try {
            var view = TestTrees.FileShares(shares: 2, foldersPerShare: 3, filesPerFolder: 10, bigFolder: 10);

            var result = view.SaveHtmlBundle(directory);

            var page = File.ReadAllText(Path.Combine(directory, "index.html"));
            var config = JsonNode.Parse(Regex.Match(page, "class=\"cx-config\">(.*?)</script>", RegexOptions.Singleline).Groups[1].Value)!;
            Assert.Equal("sidecar", config["source"]!["kind"]!.GetValue<string>());
            Assert.Equal(result.Source.BaseUrl, config["source"]!["base"]!.GetValue<string>());
            Assert.Null(config["roots"]);
            Assert.Contains("<script src=\"assets/canopyx.js\" defer></script>", page);
            Assert.True(File.Exists(Path.Combine(directory, "assets", CanopyHtmlAssets.ScriptFileName)));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "manifest.js")));
            Assert.Equal(Path.GetFullPath(Path.Combine(directory, result.Source.BaseUrl!)), Path.GetFullPath(result.DataDirectory) + Path.DirectorySeparatorChar);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }
}
