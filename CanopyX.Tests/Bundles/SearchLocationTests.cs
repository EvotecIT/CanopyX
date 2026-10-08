using CanopyX.Bundles;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A search entry tells where the pages on its path are, so the runtime can load them all at once when a hit opens:
/// the node's first children page, and the page that holds the node, each when it is in a file the reader would not
/// load anyway.
/// </summary>
public sealed class SearchLocationTests {
    [Fact]
    public void Write_ListsOverSeveralFiles_EntriesNameTheFilesAReaderNeeds() {
        var view = new CanopyTreeView("places", "Places") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        for (var t = 0; t < 450; t++) {
            var top = new CanopyNode("t" + t, "Top " + t);
            var count = t == 0 || t == 449 ? 320 : 2;
            for (var c = 0; c < count; c++) {
                var child = new CanopyNode(top.Id + "/" + c, "Child " + c);
                child.Children.Add(new CanopyNode(child.Id + "/leaf", "Leaf " + c));
                top.Children.Add(child);
            }

            view.Roots.Add(top);
        }

        var directory = Path.Combine(Path.GetTempPath(), "canopyx-places-" + Guid.NewGuid().ToString("N"));
        try {
            // A small file budget spreads the long lists over several packs, and 100 rows a page the top level over five files.
            var result = new CanopyBundleWriter(new CanopyBundleOptions { PageSize = 100, MaxFileBytes = 16 * 1024, ChildPackBytes = 16 * 1024 }).Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            foreach (var document in files.Documents) ProtocolSchema.AssertValid(document.Value, document.Key);
            var reader = new SearchIndexReader(files);
            var locations = files.Locations();

            Assert.Equal(result.NodeCount, reader.EntryCount);
            var byId = new Dictionary<string, SearchEntry>(StringComparer.Ordinal);
            for (var number = 0; number < reader.EntryCount; number++) {
                var entry = reader.Entry(number);
                byId.Add(entry.Path[entry.Path.Count - 1], entry);
                Assert.Equal(locations[entry.Path[entry.Path.Count - 1]].EntryFields(openedByHits: true), (entry.Children, entry.Page));
            }

            // The last top-level node sits on the fifth top-level page, a file of its own; its children are in a pack.
            Assert.Equal("r/4", byId["t449"].Page);
            Assert.StartsWith("p/", byId["t449"].Children);
            Assert.Null(byId["t0"].Page);
            // Its last child is on a later page of a list that spans packs, and names that page.
            Assert.NotEqual(PageLocation.FileOf(locations["t0/319"].First), PageLocation.FileOf(locations["t0/319"].Page));
            Assert.Equal(locations["t0/319"].Page, byId["t0/319"].Page);
            // A leaf names no children, and a node whose children share its file names none either.
            Assert.Null(byId["t0/319/leaf"].Children);
            Assert.Contains(byId.Values, entry => entry.Path.Count == 2 && entry.Children == null);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }
}
