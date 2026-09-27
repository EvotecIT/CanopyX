using CanopyX.Bundles;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Tests.Rendering;

public sealed class FallbackBoundaryTests {
    [Fact]
    public void BundleChildPagesPreserveDistinctSurrogateNodeIdentities() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-identity-" + Guid.NewGuid().ToString("N"));
        try {
            var view = View();
            for (var index = 0; index < 3; index++) {
                var parent = new CanopyNode(((char)(0xD800 + index)).ToString(), "Parent" + index);
                parent.Children.Add(new CanopyNode("child" + index, "Child" + index));
                view.Roots.Add(parent);
            }
            var result = new CanopyBundleWriter().Write(view, directory);
            var root = File.ReadAllText(Path.Combine(result.DataDirectory, "r", "0.js"));
            var references = System.Text.RegularExpressions.Regex.Matches(root, "\"ref\":\"([^\"]+)\"");
            Assert.Equal(3, references.Count);
            Assert.Equal(3, references.Select(m => m.Groups[1].Value).Distinct().Count());
            for (var index = 0; index < 3; index++) {
                var page = File.ReadAllText(Path.Combine(result.DataDirectory, references[index].Groups[1].Value + ".js"));
                Assert.Contains("\"id\":\"child" + index + "\"", page);
            }
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    [Theory]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:text/html,script", false)]
    [InlineData("java\tscript:alert(1)", false)]
    [InlineData("https://example.test/report", true)]
    [InlineData("report.html", true)]
    public void OverflowLinksCannotExecuteActiveSchemes(string url, bool linked) {
        var view = View();
        view.Roots.Add(new CanopyNode("a", "A"));
        view.Roots.Add(new CanopyNode("b", "B"));
        var html = CanopyStaticHtml.Render(view, new CanopyStaticHtmlOptions { MaxRows = 1, FullReportUrl = url });
        Assert.Equal(linked, html.Contains("<a href=", StringComparison.Ordinal));
    }

    [Fact]
    public void ExplicitNullTreeCellDoesNotFallBackToLabel() {
        var view = View();
        var node = new CanopyNode("a", "Fallback label");
        view.Roots.Add(node);
        Assert.Contains("Fallback label", CanopyStaticHtml.Render(view));
        node.Cells["name"] = null!;
        Assert.DoesNotContain("Fallback label", CanopyStaticHtml.Render(view));
    }

    [Theory]
    [InlineData("con")]
    [InlineData("data/aux")]
    [InlineData("data/COM1.txt")]
    public void CustomDataPathsRejectDeviceNames(string path) {
        Assert.Throws<ArgumentException>(() => new CanopyBundleOptions { DataPath = path });
    }

    private static CanopyView View(string id = "test") {
        var view = new CanopyView(id, "Test");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        return view;
    }

    [Fact]
    public void StaticOverflowRetainsUnknownAndLargeCounts() {
        var view = View();
        view.Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}");
        view.Roots.Add(new CanopyNode("a", "A") { HasChildren = true });
        var options = new CanopyStaticHtmlOptions { FullReportUrl = "https://example.test/full" };
        var html = CanopyStaticHtml.Render(view, options);
        Assert.Contains("Showing 1 of unknown rows.", html);
        Assert.Contains("https://example.test/full", html);
        view.Roots[0].ChildCount = 1_500_000_000;
        view.Roots.Add(new CanopyNode("b", "B") { HasChildren = true, ChildCount = 1_500_000_000 });
        Assert.Contains("3,000,000,002", CanopyStaticHtml.Render(view, options));
    }

    [Fact]
    public void StaticAndJsonRejectNullOrdinaryCellBadges() {
        var view = View();
        var node = new CanopyNode("row", "Row");
        var cell = new CanopyCell("Value");
        cell.Badges.Add(null!);
        node.Cells["name"] = cell;
        view.Roots.Add(node);
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }

    [Fact]
    public void StaticAndJsonRejectMalformedDetailCollections() {
        var view = View();
        var table = new CanopyTableDetail().AddColumns("Value");
        view.Roots.Add(new CanopyNode("detail", "Detail") { Detail = table });
        foreach (var row in new IList<CanopyCell>[] { new List<CanopyCell>(), null! }) {
            table.Rows.Clear(); table.Rows.Add(row);
            Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
            Assert.Throws<InvalidOperationException>(() => view.ToJson());
        }
        table.Rows.Clear();
        var cell = new CanopyCell("Value"); cell.Badges.Add(null!); table.AddRow(cell);
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
        var properties = new CanopyPropertiesDetail();
        view.Roots[0].Detail = properties;
        properties.Items.Add(null!);
        Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.Render(view));
    }

    [Fact]
    public void BundlesRetainCompleteRemoteTreesAndDistinctPortableIdentity() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-boundary-" + Guid.NewGuid().ToString("N"));
        try {
            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var id in new[] { "a.b", "a?b", "Files", "files", "\uD800", "\uD801" }) {
                var view = View(id);
                view.Source = CanopySource.Remote("c?ref={ref}&cursor={cursor}");
                var root = new CanopyNode("root", "Root") { Ref = "original/ref" };
                root.Children.Add(new CanopyNode("child", "Child")); view.Roots.Add(root);
                var result = new CanopyBundleWriter().Write(view, directory);
                Assert.True(paths.Add(result.DataDirectory));
                Assert.True(File.Exists(Path.Combine(result.DataDirectory, "manifest.js")));
            }
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    [Theory]
    [InlineData("./assets/")]
    [InlineData("./")]
    public void DotRelativeAssetsAreWrittenAndFullPagesIgnoreFragmentHeight(string assetUrl) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var view = View();
            var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = assetUrl, Height = "100px" };
            Assert.DoesNotContain("style=\"height:100px", view.ToHtmlPage(options));
            Assert.Contains("style=\"height:100px", view.ToHtmlFragment(options));
            view.SaveHtmlBundle(directory, options: options);
            Assert.True(File.Exists(Path.Combine(directory, assetUrl, "canopyx.js")));
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
