using CanopyX.Bundles;

namespace CanopyX.Tests.Bundles;

public sealed class BundleEnvelopeTests {
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void OversizedFixedEnvelopesFail(bool longParent) {
        var dir = Path.Combine(Path.GetTempPath(), "canopyx-envelope-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyTreeView(longParent ? "view" : new string('v', 20000), "View");
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
            var view = new CanopyTreeView("view", "View") { Search = new CanopySearchOptions() };
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var node = new CanopyNode("n0", "x"); view.Roots.Add(node);
            for (var i = 1; i <= 600; i++) { var child = new CanopyNode("n" + i, i == 600 ? "Target" : "x"); node.Children.Add(child); node = child; }
            var result = new CanopyBundleWriter().Write(view, dir);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            var reader = new SearchIndexReader(files);
            Assert.Equal(601, reader.Find("x").Count + reader.Find("target").Count);
            var hit = reader.Entry(Assert.Single(reader.Find("target")));
            Assert.Equal(Enumerable.Range(0, 601).Select(i => "n" + i), hit.Path);
            Assert.Equal(601, result.NodeCount);
        } finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }

    [Fact]
    public void AncestorsThatCannotFitOneSearchEntryFileFailWithTheBudget() {
        var dir = Path.Combine(Path.GetTempPath(), "canopyx-stem-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyTreeView("view", "View") { Search = new CanopySearchOptions() };
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var node = new CanopyNode("n0", "Level"); view.Roots.Add(node);
            for (var i = 1; i <= 3000; i++) { var child = new CanopyNode("n" + i, "Level"); node.Children.Add(child); node = child; }
            var error = Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter(new CanopyBundleOptions { MaxFileBytes = 16 * 1024 }).Write(view, dir));
            Assert.Contains("ancestors", error.Message); Assert.Contains("MaxFileBytes", error.Message);
        } finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }
}
