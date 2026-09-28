using System.Globalization;
using System.Text;
using CanopyX.Bundles;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A bundle is read by the browser runtime from file:// by following references, so every node must be reachable
/// from the manifest, every file must be a valid document, no file may blow the sidecar budget, and every search word
/// must sit in the shard the runtime looks in (docs/data-protocol.md, "Sidecar").
/// </summary>
public sealed class BundleWriterTests : IClassFixture<BundleFixture> {
    [Theory]
    [InlineData("Ար", "_0561_0580")]
    [InlineData("\u1C89\u1C89", "_1c8a_1c8a")]
    public void SearchIndexFoldsCapitalsIntoTheMatchingShard(string label, string key) {
        var view = new CanopyView("folding", "Folding") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("one", label));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-folding-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            Assert.NotNull(files.Document("manifest")["search"]!["shards"]![key]);
            Assert.Equal("one", files.Document("s/k-" + key)["entries"]![0]!["path"]![0]!.GetValue<string>());
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void InvalidColumnKindFailsBeforeBundleOutput() {
        var view = new CanopyView("bad-kind", "View");
        view.Columns.Add(new CanopyColumn("name", "Name") { Kind = (CanopyColumnKind)999 });
        view.Roots.Add(new CanopyNode("one", "One"));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bad-kind-" + Guid.NewGuid().ToString("N"));
        try {
            Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBundleWriter().Write(view, directory));
            Assert.False(Directory.Exists(directory));
            Assert.Throws<ArgumentOutOfRangeException>(() => view.SaveHtmlBundle(directory));
            Assert.False(Directory.Exists(directory));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void InvalidSelectionFailsBeforeBundleOutput() {
        var view = new CanopyView("bad-selection", "View") { Selection = (CanopySelectionMode)999 };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("one", "One"));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bad-selection-" + Guid.NewGuid().ToString("N"));
        try {
            Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBundleWriter().Write(view, directory));
            Assert.False(Directory.Exists(directory));
            Assert.Throws<ArgumentOutOfRangeException>(() => view.SaveHtmlBundle(directory));
            Assert.False(Directory.Exists(directory));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_CompleteRemoteTree_ReplacesAnOriginalLoadReference() {
        var view = new CanopyView("complete-ref", "Complete tree") { Source = CanopySource.Remote("children?ref={ref}&cursor={cursor}") };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var parent = new CanopyNode("parent", "Parent") { Ref = "old-host-reference", HasChildren = true };
        parent.Children.Add(new CanopyNode("child", "Child"));
        view.Roots.Add(parent);
        // The ordinary remote protocol still forbids a node with both an inline child and a load reference.
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-complete-ref-" + Guid.NewGuid().ToString("N"));
        try {
            var result = view.SaveHtmlBundle(directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            var root = files.Document("r/0")["items"]![0]!;
            var childRef = root["ref"]!.GetValue<string>();
            Assert.NotEqual("old-host-reference", childRef);
            Assert.Equal("child", files.Document(childRef)["items"]![0]!["id"]!.GetValue<string>());
            Assert.True(File.Exists(Path.Combine(directory, "index.html")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData("con")]
    [InlineData("NUL")]
    [InlineData("aux")]
    [InlineData("COM1")]
    [InlineData("lpt9")]
    public void Write_ReservedViewId_UsesAPortableDataFolder(string id) {
        var view = new CanopyView(id, "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            Assert.StartsWith("_" + id + "-", Path.GetFileName(result.DataDirectory));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "manifest.js")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void DeepTreeWithoutSearchWritesEveryChildPage() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-deep-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyView("deep", "Deep tree");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var node = new CanopyNode("n0", "Node 0");
            view.Roots.Add(node);
            for (var i = 1; i < 2000; i++) {
                var child = new CanopyNode("n" + i, "Node " + i);
                node.Children.Add(child);
                node = child;
            }
            var result = new CanopyBundleWriter().Write(view, directory);
            Assert.Equal(2000, result.NodeCount);
            Assert.Equal(2000, result.PageCount);
            Assert.Equal(0, result.SearchShardCount);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            var reference = files.Document("manifest")["root"]!.GetValue<string>();
            for (var i = 0; i < 2000; i++) {
                var item = files.Document(reference)["items"]![0]!;
                Assert.Equal("n" + i, item["id"]!.GetValue<string>());
                if (i < 1999) reference = item["ref"]!.GetValue<string>();
                else Assert.Null(item["ref"]);
            }
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_ManifestOverBudget_FailsWithTheReferenceAndBudget() {
        var view = new CanopyView("large-index", "Index") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        for (var i = 0; i < 1600; i++) {
            view.Roots.Add(new CanopyNode(i.ToString(CultureInfo.InvariantCulture), "字" + (char)(0x4e00 + i)));
        }
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var error = Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter(new CanopyBundleOptions { MaxFileBytes = 16384 }).Write(view, directory));
            Assert.Contains("manifest", error.Message);
            Assert.Contains("MaxFileBytes", error.Message);
            Assert.False(File.Exists(Path.Combine(directory, "data", view.Id, "manifest.js")));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private readonly BundleFixture _bundle;

    public BundleWriterTests(BundleFixture bundle) {
        _bundle = bundle;
    }

    [Fact]
    public void Write_LargeTree_EveryNodeIsReachableFromTheManifestInOrder() {
        var expected = TestTrees.Ids(_bundle.View.Roots);

        Assert.Equal(expected, _bundle.Files.WalkIds());
        Assert.Equal(expected.Count, _bundle.Result.NodeCount);
        Assert.Equal(_bundle.Files.Documents.Count, _bundle.Result.FileCount);
    }

    [Fact]
    public void Write_LargeTree_EveryFileMatchesTheSchema() {
        foreach (var document in _bundle.Files.Documents) {
            ProtocolSchema.AssertValid(document.Value, document.Key);
        }
    }

    [Fact]
    public void Write_LargeTree_StaysWithinTheSidecarFileBudget() {
        Assert.True(_bundle.Result.LargestFileBytes <= 1024 * 1024, "Largest sidecar file is " + _bundle.Result.LargestFileBytes + " bytes; the budget is 1 MB.");
        Assert.Equal(_bundle.Files.Sizes.Values.Max(), _bundle.Result.LargestFileBytes);
        // The 3,000 files of the big folder are split into pages of 250 instead of one large file.
        var bigFolderPages = _bundle.Files.Documents.Values.Select(text => System.Text.Json.Nodes.JsonNode.Parse(text)!)
            .Where(document => document["type"]!.GetValue<string>() == "page" && document["parent"]?.GetValue<string>() == "s0/f0")
            .ToList();
        Assert.Equal(12, bigFolderPages.Count);
        Assert.All(bigFolderPages, page => Assert.Equal(3000, page["total"]!.GetValue<int>()));
    }

    [Fact]
    public void Write_Search_FilesEveryWordWhereTheRuntimeLooksForIt() {
        var shards = _bundle.Files.Document("manifest")["search"]!["shards"]!.AsObject().Select(p => p.Key).ToList();
        var entries = shards.ToDictionary(key => key, key => _bundle.Files.Document("s/k-" + key)["entries"]!.AsArray()
            .Select(entry => string.Join("\n", entry!["path"]!.AsArray().Select(id => id!.GetValue<string>()))).ToHashSet());
        foreach (var shard in entries) {
            Assert.True(shard.Value.Count <= 500, "Shard '" + shard.Key + "' has " + shard.Value.Count + " entries; the limit is 500.");
        }

        // "archive" is in thousands of labels, so its shard is stored in parts.
        Assert.Contains("archive-.2", shards);

        var samples = TestTrees.Ids(_bundle.View.Roots).Where((id, index) => index % 37 == 0).ToList();
        var nodes = Flatten(_bundle.View.Roots).ToDictionary(pair => pair.Node.Id);
        foreach (var id in samples) {
            var (node, path) = nodes[id];
            if (node.Detail != null) {
                continue;
            }

            foreach (var word in Words(node.Label).Where(w => w.Length >= 2)) {
                var found = WithParts(shards, Lookup(shards, word)).Any(key => entries[key].Contains(path));
                Assert.True(found, "Word '" + word + "' of '" + node.Label + "' is not in the shards the runtime loads.");
            }
        }
    }

    [Fact]
    public void Write_NonAsciiLabels_FoldLikeTheRuntime() {
        // İ has a two-unit lowercase form, so it stays; Ł, ó, ß, and Ω fold to single lowercase units.
        var shards = _bundle.Files.Document("manifest")["search"]!["shards"]!.AsObject().Select(p => p.Key).ToList();

        Assert.Contains(shards, key => key.StartsWith("_0130s", StringComparison.Ordinal));
        Assert.Contains(shards, key => key.StartsWith("_0142_00f3", StringComparison.Ordinal));
        Assert.Contains(shards, key => key.StartsWith("st", StringComparison.Ordinal));
        // Greek and Cyrillic capitals fold with the fixed table: "ΑΘΗΝΑ" and "Αθήνα" share "αθ", "МОСКВА" files under "мо".
        Assert.Contains(shards, key => key.StartsWith("_03b1_03b8", StringComparison.Ordinal));
        Assert.Contains(shards, key => key.StartsWith("_043c_043e", StringComparison.Ordinal));
    }

    [Fact]
    public void Write_DeepTreeWithLongIds_KeepsEveryFileWithinTheDefaultBudget() {
        var view = new CanopyView("deep", "Deep tree") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var root = new CanopyNode("projects", "projects");
        var level = new List<CanopyNode> { root };
        for (var depth = 1; depth <= 7; depth++) {
            var next = new List<CanopyNode>();
            foreach (var parent in level.Take(4)) {
                for (var i = 0; i < 12; i++) {
                    var child = new CanopyNode(parent.Id + "/department-" + depth + "-" + i + "-quarterly-report", "Quarterly report folder " + depth + " " + i + " docx archive");
                    parent.Children.Add(child);
                    next.Add(child);
                }
            }

            level = next;
        }

        foreach (var parent in level.Take(3)) {
            for (var i = 0; i < 4000; i++) {
                parent.Children.Add(new CanopyNode(parent.Id + "/file-" + i + "-quarterly-report.docx", "Quarterly report " + i + " archive docx"));
            }
        }

        view.Roots.Add(root);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);

            Assert.True(result.LargestFileBytes <= 512 * 1024, "Largest sidecar file is " + result.LargestFileBytes + " bytes; the default budget is 512 KiB.");
            Assert.True(result.SearchShardCount > 1);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_SameView_IsByteIdentical() {
        var view = TestTrees.FileShares(shares: 3, foldersPerShare: 5, filesPerFolder: 20, bigFolder: 600);
        var first = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        var second = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var a = new CanopyBundleWriter().Write(view, first);
            var b = new CanopyBundleWriter().Write(view, second);
            var filesA = Directory.EnumerateFiles(a.DataDirectory, "*", SearchOption.AllDirectories).Select(f => Path.GetRelativePath(a.DataDirectory, f)).OrderBy(f => f, StringComparer.Ordinal).ToList();
            var filesB = Directory.EnumerateFiles(b.DataDirectory, "*", SearchOption.AllDirectories).Select(f => Path.GetRelativePath(b.DataDirectory, f)).OrderBy(f => f, StringComparer.Ordinal).ToList();

            Assert.Equal(filesA, filesB);
            Assert.All(filesA, file => Assert.Equal(File.ReadAllBytes(Path.Combine(a.DataDirectory, file)), File.ReadAllBytes(Path.Combine(b.DataDirectory, file))));
        } finally {
            Directory.Delete(first, recursive: true);
            Directory.Delete(second, recursive: true);
        }
    }

    [Fact]
    public void Write_NodeWithChildrenNotInTheTree_Throws() {
        var view = new CanopyView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("lazy", "Lazy") { HasChildren = true });

        var error = Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter().Write(view, Path.GetTempPath()));
        Assert.Contains("needs the complete tree", error.Message);
    }

    private static IEnumerable<string> WithParts(List<string> keys, IEnumerable<string> found) =>
        found.Concat(keys.Where(k => found.Any(baseKey => k.StartsWith(baseKey + ".", StringComparison.Ordinal)))).Distinct();

    /// <summary>The runtime's shard lookup from docs/data-protocol.md, for one folded query word.</summary>
    private static IEnumerable<string> Lookup(List<string> keys, string word) {
        for (var length = 2; length <= word.Length; length++) {
            var key = Key(word.Substring(0, length));
            if (keys.Contains(key)) {
                return new[] { key };
            }

            var deeper = keys.Where(k => k.Length > key.Length && k.StartsWith(key, StringComparison.Ordinal) && k[key.Length] != '.').ToList();
            if (deeper.Count == 0) {
                return Array.Empty<string>();
            }

            if (length == word.Length) {
                return deeper;
            }
        }

        return Array.Empty<string>();
    }

    private static string Key(string prefix) {
        var key = new StringBuilder();
        foreach (var unit in prefix) {
            key.Append((unit >= 'a' && unit <= 'z') || (unit >= '0' && unit <= '9') ? unit.ToString() : "_" + ((int)unit).ToString("x4", CultureInfo.InvariantCulture));
        }

        return key.ToString();
    }

    /// <summary>Folding from the table in docs/data-protocol.md, written out independently of the writer.</summary>
    private static IEnumerable<string> Words(string label) {
        var folded = new StringBuilder();
        foreach (var unit in label) {
            folded.Append(unit < 128 && !char.IsAsciiLetterOrDigit(unit) ? ' ' : (char)FoldBySpec(unit));
        }

        return folded.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries).Distinct();
    }

    private static int FoldBySpec(int c) {
        var accented = new Dictionary<int, int> { [0x0386] = 0x03AC, [0x0388] = 0x03AD, [0x0389] = 0x03AE, [0x038A] = 0x03AF, [0x038C] = 0x03CC, [0x038E] = 0x03CD, [0x038F] = 0x03CE };
        var evenCapitals = (c >= 0x0100 && c <= 0x0137 && c != 0x0130 && c != 0x0131) || (c >= 0x014A && c <= 0x0177);
        var oddCapitals = (c >= 0x0139 && c <= 0x0148) || (c >= 0x0179 && c <= 0x017E);
        return c >= 'A' && c <= 'Z' ? c + 32
            : c >= 0xC0 && c <= 0xDE && c != 0xD7 ? c + 32
            : evenCapitals && c % 2 == 0 || oddCapitals && c % 2 == 1 ? c + 1
            : c == 0x0178 ? 0x00FF
            : (c >= 0x0391 && c <= 0x03A9 && c != 0x03A2) || (c >= 0x0410 && c <= 0x042F) ? c + 32
            : c >= 0x0400 && c <= 0x040F ? c + 0x50
            : accented.TryGetValue(c, out var small) ? small : c;
    }

    [Theory]
    [InlineData("data//view")]
    [InlineData("data//")]
    [InlineData("data./view")]
    [InlineData("data/../x")]
    [InlineData("./data")]
    [InlineData("data#1")]
    [InlineData("data./")]
    [InlineData("/data")]
    public void DataPath_OutsideTheBundleOrNotUrlSafe_Throws(string path) {
        Assert.Throws<ArgumentException>(() => new CanopyBundleOptions { DataPath = path });
    }

    private static IEnumerable<(CanopyNode Node, string Path)> Flatten(IEnumerable<CanopyNode> roots) {
        var pending = new Stack<(CanopyNode Node, string Path)>(roots.Reverse().Select(root => (root, root.Id)));
        while (pending.Count > 0) {
            var item = pending.Pop();
            yield return item;
            foreach (var child in item.Node.Children.Reverse()) {
                pending.Push((child, item.Path + "\n" + child.Id));
            }
        }
    }
}
