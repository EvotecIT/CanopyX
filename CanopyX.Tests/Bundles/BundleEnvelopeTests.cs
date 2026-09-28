using CanopyX.Bundles;

namespace CanopyX.Tests.Bundles;

public sealed class BundleEnvelopeTests {
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void OversizedFixedEnvelopesFail(bool longParent) {
        var dir = Path.Combine(Path.GetTempPath(), "canopyx-envelope-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyView(longParent ? "view" : new string('v', 20000), "View");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var parent = new CanopyNode(longParent ? new string('p', 20000) : "parent", "Parent");
            parent.Children.Add(new CanopyNode("child", "Child")); view.Roots.Add(parent);
            var error = Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter(new CanopyBundleOptions { MaxFileBytes = 16 * 1024 }).Write(view, dir));
            Assert.Contains("fixed envelope", error.Message); Assert.Contains("MaxFileBytes", error.Message);
        } finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }

    [Fact]
    public void SearchableDescendantKeepsAllUnsearchableAncestors() {
        var dir = Path.Combine(Path.GetTempPath(), "canopyx-linked-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyView("view", "View") { Search = new CanopySearchOptions() };
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var node = new CanopyNode("n0", "x"); view.Roots.Add(node);
            for (var i = 1; i <= 600; i++) { var child = new CanopyNode("n" + i, i == 600 ? "Target" : "x"); node.Children.Add(child); node = child; }
            var result = new CanopyBundleWriter().Write(view, dir);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            Assert.Equal(1, result.SearchShardCount);
            var hit = files.Document("s/k-ta")["entries"]![0]!;
            Assert.Equal(Enumerable.Range(0, 601).Select(i => "n" + i), hit["path"]!.AsArray().Select(v => v!.GetValue<string>()));
            Assert.Equal(601, result.NodeCount);
        } finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }
}
