using CanopyX.Bundles;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

public sealed class StreamingBundleTests {
    [Fact]
    public void CommonWordPartsAndContinuationPagesKeepEveryEntryWithinTheBudget() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-stream-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyView("stream", "Stream") { Search = new CanopySearchOptions() };
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var parent = new CanopyNode("parent", "Parent"); view.Roots.Add(parent);
            for (var index = 0; index < 1250; index++) parent.Children.Add(new CanopyNode("child-" + index, "Archive " + new string('x', 200)));
            var options = new CanopyBundleOptions { MaxFileBytes = 16 * 1024, PageSize = 37, SearchShardLimit = 100 };
            var result = new CanopyBundleWriter(options).Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            var manifest = files.Document("manifest"); ProtocolSchema.AssertValid(manifest.ToJsonString(), "stream manifest");
            var keys = manifest["search"]!["shards"]!.AsObject().Select(p => p.Key).Where(k => k == "archive-" || k.StartsWith("archive-.", StringComparison.Ordinal))
                .OrderBy(k => k == "archive-" ? 1 : int.Parse(k[(k.LastIndexOf('.') + 1)..], System.Globalization.CultureInfo.InvariantCulture)).ToList();
            Assert.True(keys.Count > 10);
            var hitIds = new List<string>();
            foreach (var key in keys) {
                var shard = files.Document("s/k-" + key);
                Assert.Equal(key, shard["key"]!.GetValue<string>());
                Assert.InRange(shard["entries"]!.AsArray().Count, 1, options.SearchShardLimit);
                hitIds.AddRange(shard["entries"]!.AsArray().Select(e => e!["path"]!.AsArray()[1]!.GetValue<string>()));
            }
            Assert.Equal(parent.Children.Select(c => c.Id), hitIds);
            var root = files.Document("r/0");
            string? reference = root["items"]![0]!["ref"]!.GetValue<string>();
            var ids = new List<string>();
            while (reference != null) {
                var page = files.Document(reference); ProtocolSchema.AssertValid(page.ToJsonString(), "stream page");
                Assert.Equal("parent", page["parent"]!.GetValue<string>());
                Assert.Equal(ids.Count, page["offset"]!.GetValue<int>());
                Assert.Equal(1250, page["total"]!.GetValue<int>());
                Assert.InRange(page["items"]!.AsArray().Count, 1, options.PageSize);
                ids.AddRange(page["items"]!.AsArray().Select(n => n!["id"]!.GetValue<string>()));
                reference = page["next"]?.GetValue<string>();
            }
            Assert.Equal(parent.Children.Select(c => c.Id), ids);
            Assert.All(Directory.GetFiles(result.DataDirectory, "*.js", SearchOption.AllDirectories), file => Assert.InRange(new FileInfo(file).Length, 1, options.MaxFileBytes));
        } finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
    }
}
