using System.Globalization;
using System.Text;
using CanopyX.Bundles;
using CanopyX.Examples;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A bundle is read by the browser runtime from file:// by following references, so every node must be reachable
/// from the manifest, every file must be a valid document, no file may blow the sidecar budget, and the search index
/// must lead from every word to its nodes the way the runtime reads it (docs/data-protocol.md, "Search Index").
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
            var reader = new SearchIndexReader(files);
            var folded = reader.Shard(key)["words"]![0]!.GetValue<string>();
            Assert.Equal(new[] { "one" }, reader.Entry(Assert.Single(reader.Find(folded))).Path);
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
        Assert.Equal(_bundle.Files.Sizes.Count, _bundle.Result.FileCount);
    }

    [Fact]
    public void Write_LargeTree_EveryFileMatchesTheSchema() {
        foreach (var document in _bundle.Files.Documents) {
            ProtocolSchema.AssertValid(document.Value, document.Key);
        }

        // The schema sees a packed page as text, so the pages inside the packs are checked one by one.
        foreach (var page in _bundle.Files.Pages()) {
            ProtocolSchema.AssertValid(page.Value, page.Key);
        }
    }

    [Fact]
    public void Write_LargeTree_PacksTheChildrenPagesIntoFewFiles() {
        var parents = Flatten(_bundle.View.Roots).Count(item => item.Node.Children.Count > 0);
        var packs = _bundle.Files.Documents.Keys.Where(reference => reference.StartsWith("p/", StringComparison.Ordinal)).ToList();

        // 372 parents have children; with one file per child list the bundle would hold at least as many files.
        Assert.True(parents > 300);
        Assert.Equal(_bundle.Result.PackCount, packs.Count);
        Assert.Equal(packs.Count, _bundle.Files.Document("manifest")["packs"]!.GetValue<int>());
        Assert.InRange(packs.Count, 1, 4);
        Assert.Equal(_bundle.Result.PageCount, _bundle.Files.Pages().Count());
        // A pack is full before the next one starts: every pack but the last is within a page of the file budget.
        Assert.All(packs.Where(reference => reference != "p/" + (packs.Count - 1)), reference =>
            Assert.InRange(_bundle.Files.Sizes[reference], 512 * 1024 - 80 * 1024, 512 * 1024));
    }

    [Fact]
    public void Write_NodeLargerThanTheBudget_GetsAPackOfItsOwn() {
        var view = new CanopyView("oversized", "Oversized");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var parent = new CanopyNode("parent", "Parent");
        for (var index = 0; index < 40; index++) {
            parent.Children.Add(new CanopyNode("child-" + index, index == 20 ? new string('x', 40000) : new string('y', 600)));
        }

        view.Roots.Add(parent);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter(new CanopyBundleOptions { MaxFileBytes = 16 * 1024 }).Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);

            Assert.Equal(TestTrees.Ids(view.Roots), files.WalkIds());
            var over = Assert.Single(files.Sizes, file => file.Value > 16 * 1024);
            var page = System.Text.Json.Nodes.JsonNode.Parse(Assert.Single(System.Text.Json.Nodes.JsonNode.Parse(files.Documents[over.Key])!["pages"]!.AsArray())!.GetValue<string>())!;
            Assert.Equal("child-20", Assert.Single(page["items"]!.AsArray())!["id"]!.GetValue<string>());
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_LabelsWithTemplateSyntax_SurviveInsideAPack() {
        var view = new CanopyView("templates", "Templates");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var parent = new CanopyNode("parent", "Parent");
        var labels = new[] { "a `quoted` name", "cost ${amount} and $ {x} and $", "back\\slash \\` \\${ end\\", "line\nbreak \r\n tab\t", "`", "${", "$" };
        for (var index = 0; index < labels.Length; index++) {
            parent.Children.Add(new CanopyNode("child-" + index + "-`${" + index + "}", labels[index]));
        }

        view.Roots.Add(parent);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            // A pack stores each page in a String.raw template; a backtick or ${ in the file would end or break it.
            var script = File.ReadAllText(Path.Combine(result.DataDirectory, "p", "0.js"));
            Assert.Equal(2, script.Count(ch => ch == '`'));
            Assert.DoesNotContain("${", script);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            var items = files.Document(files.Document("r/0")["items"]![0]!["ref"]!.GetValue<string>())["items"]!.AsArray();
            Assert.Equal(labels, items.Select(item => item!["label"]!.GetValue<string>()));
            Assert.Equal(parent.Children.Select(child => child.Id), items.Select(item => item!["id"]!.GetValue<string>()));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_LargeTree_StaysWithinTheSidecarFileBudget() {
        Assert.True(_bundle.Result.LargestFileBytes <= 1024 * 1024, "Largest sidecar file is " + _bundle.Result.LargestFileBytes + " bytes; the budget is 1 MB.");
        Assert.Equal(_bundle.Files.Sizes.Values.Max(), _bundle.Result.LargestFileBytes);
        // The 3,000 files of the big folder are split into pages of 250 instead of one large file.
        var bigFolderPages = _bundle.Files.Pages().Select(page => System.Text.Json.Nodes.JsonNode.Parse(page.Value)!)
            .Where(document => document["parent"]?.GetValue<string>() == "s0/f0")
            .ToList();
        Assert.Equal(12, bigFolderPages.Count);
        Assert.All(bigFolderPages, page => Assert.Equal(3000, page["total"]!.GetValue<int>()));
    }

    [Fact]
    public void Write_Search_EntryFilesRebuildEveryNodeOnTheirOwn() {
        var reader = new SearchIndexReader(_bundle.Files);
        var expected = Flatten(_bundle.View.Roots).ToList();

        Assert.Equal(expected.Count, reader.EntryCount);
        Assert.Equal(_bundle.Result.SearchEntryFileCount, reader.EntryFiles.Count);
        for (var number = 0; number < expected.Count; number++) {
            var entry = reader.Entry(number);
            Assert.Equal(expected[number].Path, string.Join("\n", entry.Path));
            Assert.Equal(expected[number].Node.Label, entry.Label);
            Assert.Equal(expected[number].Node.Kind, entry.Kind);
        }
    }

    [Fact]
    public void Write_Search_FindsEveryNodeByEachWordEachPrefixAndItsWholeLabel() {
        var reader = new SearchIndexReader(_bundle.Files);
        var nodes = Flatten(_bundle.View.Roots).ToList();
        var words = nodes.Select(node => SearchIndexReader.Words(node.Node.Label).ToList()).ToList();
        for (var number = 0; number < nodes.Count; number += 37) {
            var label = nodes[number].Node.Label;
            foreach (var word in words[number]) {
                for (var length = 1; length <= word.Length; length++) {
                    Assert.True(reader.Find(word.Substring(0, length)).BinarySearch(number) >= 0,
                        "'" + word.Substring(0, length) + "' does not find '" + label + "' in the shards the runtime loads.");
                }
            }

            Assert.True(reader.Find(SearchIndexReader.LabelToken(label)).BinarySearch(number) >= 0, "The label token does not find '" + label + "'.");
        }

        // And nothing else: a word finds exactly the nodes that have a word starting with it.
        foreach (var query in new[] { "file", "fi", "7", "29", "budget", "\u0142\u00f3d\u017a", "\u03b1\u03b8", "share", "details", "zz" }) {
            var expected = Enumerable.Range(0, nodes.Count).Where(number => words[number].Any(word => word.StartsWith(query, StringComparison.Ordinal))).ToList();
            Assert.Equal(expected, reader.Find(query));
        }
    }

    [Theory]
    [InlineData("Budget 2026", "\0108bf3fa")]
    [InlineData("  (Budget 2026). ", "\0108bf3fa")]
    [InlineData("\u0141\u00d3D\u0179 office", "\07b6f5428")]
    public void Write_Search_FilesEachLabelUnderItsToken(string label, string token) {
        // The same vectors are pinned for the browser runtime in tests/browser/specs/search-index-contracts.spec.mjs.
        var view = new CanopyView("token", "Token") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Roots.Add(new CanopyNode("one", label));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-token-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var reader = new SearchIndexReader(new SidecarFiles(result.DataDirectory, view.Id));
            var key = Assert.Single(reader.Shards.Keys, shard => shard.StartsWith("_0000", StringComparison.Ordinal));
            Assert.Equal(token, Assert.Single(reader.Shard(key)["words"]!.AsArray())!.GetValue<string>());
            Assert.Equal(new[] { 0 }, reader.Find(token));
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_SearchWithoutNodes_DescribesAnEmptyIndex() {
        var view = new CanopyView("empty", "Empty") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-empty-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            ProtocolSchema.AssertValid(files.Documents["manifest"], "manifest of an empty index");
            var reader = new SearchIndexReader(files);
            Assert.Equal(0, reader.EntryCount);
            Assert.Empty(reader.EntryFiles);
            Assert.Empty(reader.Shards);
            Assert.Equal(0, result.SearchIndexBytes);
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_Search_ShardsMatchTheManifestAndSplitAtTheLimit() {
        var reader = new SearchIndexReader(_bundle.Files);
        Assert.Equal(reader.Shards.Count, _bundle.Result.SearchShardCount);
        foreach (var shard in reader.Shards) {
            var postings = reader.Shard(shard.Key)["postings"]!.AsArray().Sum(list => SearchIndexReader.Decode(list!.AsArray()).Count);
            Assert.Equal(shard.Value, postings);
            // A shard over the limit holds one word, which cannot split further, such as "archive" in thousands of labels.
            Assert.True(postings <= 500 || SearchIndexReader.IsPart(shard.Key) || shard.Key.EndsWith('-'),
                "Shard '" + shard.Key + "' has " + postings + " postings; the limit is 500.");
        }

        Assert.Contains("archive-", reader.Shards.Keys);
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
    public void Write_AdversarialDeepTree_KeepsTheIndexSmallerThanThePages() {
        // 121,000 nodes on eight levels whose labels share four words and whose ids repeat the whole path: an index
        // that copies each entry into one shard per word is twenty times the pages here.
        var view = SearchBenchTrees.DeepTree();
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var pages = result.TotalBytes - result.SearchIndexBytes;

            Assert.True(result.LargestFileBytes <= 512 * 1024, "Largest sidecar file is " + result.LargestFileBytes + " bytes; the default budget is 512 KiB.");
            Assert.True(result.SearchIndexBytes * 2 <= pages, "The search index is " + result.SearchIndexBytes + " bytes next to " + pages + " bytes of pages; it must stay under half.");
            var reader = new SearchIndexReader(new SidecarFiles(result.DataDirectory, view.Id));
            Assert.Equal(result.NodeCount - 1, reader.Find("quarterly").Count);
            var hits = reader.Find("quarterly").Intersect(reader.Find("4019")).Select(reader.Entry).ToList();
            Assert.Equal(30, hits.Count);
            Assert.All(hits, hit => {
                Assert.Equal("Quarterly report 4019 archive docx", hit.Label);
                Assert.Equal(8, hit.Path.Count);
                Assert.EndsWith("/file-4019-quarterly-report.docx", hit.Path[7]);
                Assert.StartsWith(hit.Path[6] + "/", hit.Path[7]);
            });
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_IdsThatShareEndsWithTheirParent_RoundTripThroughTheEntryTable() {
        var view = new CanopyView("ids", "Ids") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        // Path-style ids share a prefix, distinguished names a suffix; the emoji ids differ inside a surrogate pair.
        var domain = new CanopyNode("DC=corp,DC=example", "Domain one") { Kind = "domain" };
        var unit = new CanopyNode("OU=Sales,DC=corp,DC=example", "Unit two") { Kind = "unit" };
        unit.Children.Add(new CanopyNode("OU=Users,OU=Sales,DC=corp,DC=example", "Leaf three") { Kind = "unit" });
        unit.Children.Add(new CanopyNode("DC=corp", "Shorter four"));
        unit.Children.Add(new CanopyNode("OU=Sales,DC=corp,DC=exampleOU=Sales,DC=corp,DC=example", "Doubled five") { Kind = "domain" });
        domain.Children.Add(unit);
        var emoji = new CanopyNode("a\uD83D\uDE00z", "Emoji six");
        emoji.Children.Add(new CanopyNode("a\uD83D\uDE01z", "Emoji seven"));
        emoji.Children.Add(new CanopyNode("a\uD83D\uDE00", "Emoji eight"));
        emoji.Children.Add(new CanopyNode("\uD83D\uDE00z", "Emoji nine"));
        view.Roots.Add(domain);
        view.Roots.Add(emoji);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var reader = new SearchIndexReader(new SidecarFiles(result.DataDirectory, view.Id));
            var expected = Flatten(view.Roots).ToList();

            Assert.Equal(expected.Count, reader.EntryCount);
            for (var number = 0; number < expected.Count; number++) {
                Assert.Equal(expected[number].Path, string.Join("\n", reader.Entry(number).Path));
                Assert.Equal(expected[number].Node.Kind, reader.Entry(number).Kind);
            }

            // A pair split between the shared and the written part would reach the file as a replacement character.
            // Entry file 0 is the first page of index pack 0.
            Assert.DoesNotContain('\uFFFD', File.ReadAllText(Path.Combine(result.DataDirectory, "q", "0.js")));
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
