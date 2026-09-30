using System.Text.Json.Nodes;
using CanopyX.Bundles;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A search index has thousands of small files: an entry file per 256 nodes and a shard per word prefix. Packed, they
/// share q/&lt;n&gt; files, and a reader finds each one from the first entry file and the first shard key of every pack.
/// </summary>
public sealed class SearchPackTests {
    [Fact]
    public void PackedIndex_HoldsEveryEntryFileAndShard_AndFindsWhatSeparateFilesFind() {
        var view = TestTrees.FileShares(shares: 6, foldersPerShare: 20, filesPerFolder: 20, bigFolder: 1500);
        var packed = Write(view, new CanopyBundleOptions { SearchShardLimit = 500 });
        var separate = Write(view, new CanopyBundleOptions { SearchShardLimit = 500, SearchPackBytes = 0 });
        try {
            var files = new SidecarFiles(packed.Result.DataDirectory, view.Id);
            var reader = new SearchIndexReader(files);
            ProtocolSchema.AssertValid(files.Documents["manifest"], "manifest of a packed index");
            Assert.DoesNotContain(files.Documents.Keys, reference => reference.StartsWith("e/", StringComparison.Ordinal) || reference.StartsWith("s/", StringComparison.Ordinal));
            var packs = files.Sizes.Keys.Where(reference => reference.StartsWith("q/", StringComparison.Ordinal)).ToList();
            Assert.Equal(packed.Result.SearchPackCount, packs.Count);
            Assert.True(packs.Count > 4, "The index should need several packs.");

            // Entry packs start at entry file 0 and shard packs at the first key, both ascending.
            Assert.Equal(0, reader.EntryPacks![0]);
            Assert.True(reader.EntryPacks.Zip(reader.EntryPacks.Skip(1), (a, b) => a < b).All(ascending => ascending));
            var keys = reader.Shards.Keys.OrderBy(key => key, StringComparer.Ordinal).ToList();
            Assert.Equal(keys[0], reader.ShardPacks![0]);
            Assert.True(reader.ShardPacks.Zip(reader.ShardPacks.Skip(1), (a, b) => string.CompareOrdinal(a, b) < 0).All(ascending => ascending));
            Assert.Equal(packs.Count, reader.EntryPacks.Count + reader.ShardPacks.Count);

            // Every document is where the firsts lead, and a pack stays at the size asked for unless one document is larger.
            foreach (var key in keys) Assert.Equal(key, reader.Shard(key)["key"]!.GetValue<string>());
            for (var number = 0; number < reader.EntryCount; number += 97) Assert.NotEmpty(reader.Entry(number).Path);
            foreach (var pack in packs) {
                var pages = JsonNode.Parse(files.Documents[pack])!["pages"]!.AsArray().Count;
                Assert.True(pages == 1 || files.Sizes[pack] <= 64 * 1024 + 256, pack + " holds " + pages + " documents in " + files.Sizes[pack] + " bytes.");
            }

            var plain = new SearchIndexReader(new SidecarFiles(separate.Result.DataDirectory, view.Id));
            Assert.Null(plain.EntryPacks);
            Assert.Equal(0, separate.Result.SearchPackCount);
            foreach (var word in new[] { "archive", "budget", "q3", "readme" }) {
                Assert.Equal(plain.Find(word), reader.Find(word));
            }

            Assert.Equal(plain.Shards, reader.Shards);
            Assert.True(files.Sizes.Count < new SidecarFiles(separate.Result.DataDirectory, view.Id).Sizes.Count / 2);
            // Every document inside a pack is a valid entry file or shard.
            foreach (var document in files.Documents.Where(item => item.Key.Contains('#'))) ProtocolSchema.AssertValid(document.Value, document.Key);
        } finally {
            Directory.Delete(packed.Directory, recursive: true);
            Directory.Delete(separate.Directory, recursive: true);
        }
    }

    [Fact]
    public void SeparateFiles_AreCountedByTheirSizes() {
        var view = TestTrees.FileShares(shares: 2, foldersPerShare: 4, filesPerFolder: 10, bigFolder: 50);
        var written = Write(view, new CanopyBundleOptions { SearchPackBytes = 0 });
        try {
            var files = new SidecarFiles(written.Result.DataDirectory, view.Id);
            var index = files.Sizes.Where(file => file.Key.StartsWith("s/", StringComparison.Ordinal) || file.Key.StartsWith("e/", StringComparison.Ordinal)).Sum(file => file.Value);
            Assert.Equal(index, written.Result.SearchIndexBytes);
            Assert.Equal(new SearchIndexReader(files).Shards.Keys.Select(key => "s/k-" + key).OrderBy(r => r, StringComparer.Ordinal),
                files.Documents.Keys.Where(reference => reference.StartsWith("s/", StringComparison.Ordinal)).OrderBy(r => r, StringComparer.Ordinal));
        } finally {
            Directory.Delete(written.Directory, recursive: true);
        }
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1024)]
    [InlineData(16 * 1024 * 1024 + 1)]
    public void SearchPackBytes_OutsideTheRange_Throws(int bytes) {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBundleOptions { SearchPackBytes = bytes });
        Assert.Equal(64 * 1024, new CanopyBundleOptions().SearchPackBytes);
    }

    private static (string Directory, CanopyBundleResult Result) Write(CanopyView view, CanopyBundleOptions options) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-qpack-" + Guid.NewGuid().ToString("N"));
        return (directory, new CanopyBundleWriter(options).Write(view, directory));
    }
}
