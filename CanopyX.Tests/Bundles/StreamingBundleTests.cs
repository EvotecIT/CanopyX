using CanopyX.Bundles;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

public sealed class StreamingBundleTests {
    [Fact]
    public void CommonWordPartsEntryFilesAndContinuationPagesStayWithinTheBudget() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-stream-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyTreeView("stream", "Stream") { Search = new CanopySearchOptions() };
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var parent = new CanopyNode("parent", "Parent"); view.Roots.Add(parent);
            // Every second child has the word, so its posting list is 9,000 gaps that no run shortens; the last 3,000
            // children all have it, so the part that continues the list ends in a run.
            for (var index = 0; index < 21000; index++) parent.Children.Add(new CanopyNode("child-" + index, (index % 2 == 0 || index >= 18000 ? "Archive " : "Other ") + new string('x', 60)));
            var options = new CanopyBundleOptions { MaxFileBytes = 16 * 1024, PageSize = 37 };
            var result = new CanopyBundleWriter(options).Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            foreach (var document in files.Documents) ProtocolSchema.AssertValid(document.Value, document.Key);
            var reader = new SearchIndexReader(files);
            var parts = reader.ShardsFor("archive");
            Assert.Equal(new[] { "ar", "ar.2" }, parts);
            Assert.Equal(12000, parts.Sum(key => reader.Shards[key]));
            Assert.Contains(reader.Shard("ar.2")["postings"]!.AsArray().Last()!.AsArray(), step => step!.GetValue<int>() < -1);
            Assert.Equal(parent.Children.Where((_, index) => index % 2 == 0 || index >= 18000).Select(c => c.Id), reader.Find("archive").Select(number => reader.Entry(number).Path[1]));
            Assert.True(reader.EntryFiles.Count > 21001 / 256 + 1, "The entry files did not split on the file budget.");
            var root = files.Document("r/0");
            string? reference = root["items"]![0]!["ref"]!.GetValue<string>();
            var ids = new List<string>();
            while (reference != null) {
                var page = files.Document(reference);
                Assert.Equal("parent", page["parent"]!.GetValue<string>());
                Assert.Equal(ids.Count, page["offset"]!.GetValue<int>());
                Assert.Equal(21000, page["total"]!.GetValue<int>());
                Assert.InRange(page["items"]!.AsArray().Count, 1, options.PageSize);
                ids.AddRange(page["items"]!.AsArray().Select(n => n!["id"]!.GetValue<string>()));
                reference = page["next"]?.GetValue<string>();
            }
            Assert.Equal(parent.Children.Select(c => c.Id), ids);
            Assert.All(Directory.GetFiles(result.DataDirectory, "*.js", SearchOption.AllDirectories), file => Assert.InRange(new FileInfo(file).Length, 1, options.MaxFileBytes));
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
    }
}
