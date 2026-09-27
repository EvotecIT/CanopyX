using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Bundles;
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
    [InlineData("assets./")]
    [InlineData("assets/nested./")]
    [InlineData("assets//nested/")]
    [InlineData("assets/./shared/")]
    [InlineData("assets/tmp/../shared/")]
    [InlineData("assets\\tmp\\..\\shared")]
    public void ReservedAssetFoldersFailBeforeWriting(string assetPath) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-reserved-" + Guid.NewGuid().ToString("N"));
        var view = TestTrees.FileShares(shares: 1, foldersPerShare: 1, filesPerFolder: 1, bigFolder: 1);
        try {
            Assert.Throws<ArgumentException>(() => view.SaveHtmlBundle(directory, new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = assetPath }));
            Assert.False(Directory.Exists(directory));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData("index.html/", "assets/", CanopyAssetMode.External)]
    [InlineData("INDEX.HTML/nested/", "assets/", CanopyAssetMode.Inline)]
    [InlineData("assets/canopyx.js/", "assets/", CanopyAssetMode.External)]
    [InlineData("assets/canopyx.css/nested/", "assets/", CanopyAssetMode.External)]
    [InlineData("payload/", "payload/manifest.js/", CanopyAssetMode.External)]
    [InlineData("payload/nested/", "payload/", CanopyAssetMode.External)]
    [InlineData("payload/", "INDEX.HTML/", CanopyAssetMode.External)]
    [InlineData("canopyx.js/", "./", CanopyAssetMode.External)]
    public void ConflictingBundlePathsFailBeforeWriting(string dataPath, string assetPath, CanopyAssetMode mode) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-layout-" + Guid.NewGuid().ToString("N"));
        var view = TestTrees.FileShares(shares: 1, foldersPerShare: 1, filesPerFolder: 1, bigFolder: 1);
        var originalSource = view.Source;
        try {
            Assert.Throws<ArgumentException>(() => view.SaveHtmlBundle(directory,
                new CanopyHtmlOptions { AssetMode = mode, AssetBaseUrl = assetPath }, new CanopyBundleOptions { DataPath = dataPath }));
            Assert.Same(originalSource, view.Source);
            Assert.False(Directory.Exists(directory));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData("./assets/", "assets")]
    [InlineData("./", "")]
    [InlineData("", "")]
    [InlineData("assets\\shared", "assets/shared")]
    [InlineData(".\\assets\\shared", "assets/shared")]
    public void LeadingDotAndRootAssetsAreWritten(string assetPath, string folder) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-local-" + Guid.NewGuid().ToString("N"));
        try {
            var view = TestTrees.FileShares(shares: 1, foldersPerShare: 1, filesPerFolder: 1, bigFolder: 1);
            var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = assetPath };
            view.SaveHtmlBundle(directory, options);
            Assert.True(File.Exists(Path.Combine(directory, folder, CanopyHtmlAssets.ScriptFileName)));
            Assert.Contains("src=\"" + options.AssetBaseUrl + "canopyx.js\"", File.ReadAllText(Path.Combine(directory, "index.html")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
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
