using System.Collections;
using CanopyX.Bundles;
using CanopyX.Html;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A host that cannot hold its tree in memory hands the bundle writer its nodes while the tree is written. The files
/// must be the ones the same tree gives from memory, the host's sequences must be read once and in order, and the
/// checks a complete tree gets up front must still reject a bad node.
/// </summary>
public sealed class StreamedBundleTests {
    [Fact]
    public void Write_Streamed_WritesTheSameFilesAsTheTreeInMemory() {
        var inMemory = View();
        foreach (var root in ChildrenOf(null)) {
            Attach(root);
            inMemory.Roots.Add(root);
        }

        var first = NewDirectory();
        var second = NewDirectory();
        try {
            var options = new CanopyBundleOptions { PageSize = 100, MaxFileBytes = 32 * 1024 };
            var a = new CanopyBundleWriter(options).Write(inMemory, first);
            var b = new CanopyBundleWriter(options).Write(View(), second, ChildrenOf(null), node => ChildrenOf(node.Id));

            Assert.Equal(a.NodeCount, b.NodeCount);
            Assert.True(a.PackCount > 3, "The tree should span several packs.");
            var filesA = RelativeFiles(a.DataDirectory);
            Assert.Equal(filesA, RelativeFiles(b.DataDirectory));
            Assert.All(filesA, file => Assert.Equal(File.ReadAllBytes(Path.Combine(a.DataDirectory, file)), File.ReadAllBytes(Path.Combine(b.DataDirectory, file))));
            Assert.Equal(TestTrees.Ids(inMemory.Roots), new SidecarFiles(b.DataDirectory, "streamed").WalkIds());
        } finally {
            Directory.Delete(first, recursive: true);
            Directory.Delete(second, recursive: true);
        }
    }

    [Fact]
    public void Write_Streamed_ReadsEachChildListOnceBeforeTheNextSibling() {
        var log = new List<string>();
        var directory = NewDirectory();
        try {
            IEnumerable<CanopyNode> Logged(string? parent) {
                foreach (var node in ChildrenOf(parent).Take(2)) {
                    log.Add("read " + node.Id);
                    yield return node;
                }

                log.Add("end " + (parent ?? "roots"));
            }

            new CanopyBundleWriter().Write(View(), directory, Logged(null), node => {
                log.Add("ask " + node.Id);
                return node.Id.Length < 5 ? Logged(node.Id) : null;
            });

            // Depth first: a node's children are asked for and read to their end before its next sibling is read, and
            // a detail row is never asked for children.
            Assert.Equal(new[] {
                "read r0", "ask r0", "read r0/0", "ask r0/0", "read r0/0/a", "ask r0/0/a", "read r0/0/detail", "end r0/0",
                "read r0/1", "ask r0/1", "read r0/1/a", "ask r0/1/a", "read r0/1/detail", "end r0/1", "end r0",
                "read r1", "ask r1", "read r1/0", "ask r1/0", "read r1/0/a", "ask r1/0/a", "read r1/0/detail", "end r1/0",
                "read r1/1", "ask r1/1", "read r1/1/a", "ask r1/1/a", "read r1/1/detail", "end r1/1", "end r1", "end roots"
            }, log);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_Streamed_DecidesChildrenFromWhatItReadNotFromTheNode() {
        var directory = NewDirectory();
        try {
            // The host marks both nodes as parents, as it would for a remote source; only one has children.
            var roots = new[] {
                new CanopyNode("empty", "Empty") { HasChildren = true, ChildCount = 9, Ref = "old" },
                new CanopyNode("full", "Full") { HasChildren = true, ChildCount = 9, Ref = "old" }
            };
            var result = new CanopyBundleWriter().Write(View(), directory, roots, node => node.Id == "full" ? new[] { new CanopyNode("full/a", "A"), new CanopyNode("full/b", "B") } : Array.Empty<CanopyNode>());
            var items = new SidecarFiles(result.DataDirectory, "streamed").Document("r/0")["items"]!.AsArray();

            Assert.Null(items[0]!["hasChildren"]);
            Assert.Null(items[0]!["childCount"]);
            Assert.Null(items[0]!["ref"]);
            Assert.True(items[1]!["hasChildren"]!.GetValue<bool>());
            Assert.Equal(2, items[1]!["childCount"]!.GetValue<int>());
            Assert.Equal("p/0#0", items[1]!["ref"]!.GetValue<string>());
            Assert.Equal(4, result.NodeCount);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData("duplicate id", "more than one node with id 'r0/0'")]
    [InlineData("unknown column", "does not have")]
    [InlineData("unknown icon", "does not declare")]
    [InlineData("null node", "null child")]
    [InlineData("detail with children", "detail row must be a leaf")]
    [InlineData("empty flag", "empty flag")]
    public void Write_Streamed_RejectsABadNodeAndReleasesTheOpenSequences(string fault, string message) {
        var directory = NewDirectory();
        var sequences = new List<Tracked>();
        try {
            IEnumerable<CanopyNode> Children(CanopyNode node) {
                if (node.Id != "r0") {
                    return Array.Empty<CanopyNode>();
                }

                var bad = new CanopyNode(fault == "duplicate id" ? "r0/0" : "r0/bad", "Bad");
                if (fault == "unknown column") bad.Cells["nope"] = 1;
                if (fault == "unknown icon") bad.Icon = "nope";
                if (fault == "empty flag") bad.Flags.Add(string.Empty);
                if (fault == "detail with children") {
                    bad.Detail = new CanopyHtmlDetail("x");
                    bad.Children.Add(new CanopyNode("r0/bad/child", "Child"));
                }

                return Track(new[] { new CanopyNode("r0/0", "First"), fault == "null node" ? null! : bad });
            }

            IEnumerable<CanopyNode> Track(IEnumerable<CanopyNode> nodes) {
                sequences.Add(new Tracked(nodes));
                return sequences[sequences.Count - 1];
            }

            var error = Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter().Write(View(), directory, Track(ChildrenOf(null)), Children));

            Assert.Contains(message, error.Message);
            Assert.Equal(2, sequences.Count);
            Assert.All(sequences, sequence => Assert.True(sequence.Disposed, "The writer left a sequence open after it failed."));
            // No manifest, so no page can open the partial data.
            Assert.Empty(Directory.Exists(directory) ? Directory.GetFiles(directory, "manifest.js", SearchOption.AllDirectories) : Array.Empty<string>());
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_Streamed_ReleasesTheOpenSequencesWhenTheHostFails() {
        var directory = NewDirectory();
        var roots = new Tracked(ChildrenOf(null));
        var folders = new Tracked(ChildrenOf("r0"));
        try {
            var error = Assert.Throws<TimeoutException>(() => new CanopyBundleWriter().Write(View(), directory, roots,
                node => node.Id == "r0" ? folders : node.Id == "r0/3" ? throw new TimeoutException("The host's query failed.") : null));

            Assert.Equal("The host's query failed.", error.Message);
            Assert.True(roots.Disposed && folders.Disposed, "The writer left a sequence open after the host failed.");
        } finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_Streamed_WithoutNodesOrSearch_WritesAnEmptyTopLevel() {
        var directory = NewDirectory();
        try {
            var view = new CanopyTreeView("empty", "Empty");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var result = new CanopyBundleWriter().Write(view, directory, Array.Empty<CanopyNode>(), node => null);
            var files = new SidecarFiles(result.DataDirectory, view.Id);

            Assert.Equal(new[] { "manifest", "r/0" }, files.Documents.Keys.OrderBy(key => key, StringComparer.Ordinal));
            Assert.Empty(files.Document("r/0")["items"]!.AsArray());
            Assert.Equal(0, files.Document("manifest")["packs"]!.GetValue<int>());
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Write_Streamed_NeedsAViewWithoutRootsAndBothSources() {
        var withRoots = View();
        withRoots.Roots.Add(new CanopyNode("own", "Own"));

        Assert.Throws<ArgumentException>(() => new CanopyBundleWriter().Write(withRoots, Path.GetTempPath(), ChildrenOf(null), node => null));
        Assert.Throws<ArgumentNullException>(() => new CanopyBundleWriter().Write(View(), Path.GetTempPath(), null!, node => null));
        Assert.Throws<ArgumentNullException>(() => new CanopyBundleWriter().Write(View(), Path.GetTempPath(), ChildrenOf(null), null!));
    }

    [Fact]
    public void SaveHtmlBundle_Streamed_WritesThePageAndPointsTheViewAtTheData() {
        var directory = NewDirectory();
        try {
            var view = View();
            var result = view.SaveHtmlBundle(directory, ChildrenOf(null), node => ChildrenOf(node.Id));

            Assert.Equal(CanopySourceKind.Sidecar, view.Source.Kind);
            Assert.Same(result.Source, view.Source);
            Assert.Empty(view.Roots);
            Assert.Contains("\"source\":{\"kind\":\"sidecar\"", File.ReadAllText(Path.Combine(directory, "index.html")));
            Assert.True(File.Exists(Path.Combine(directory, "assets", CanopyX.Html.CanopyHtmlAssets.HashedScriptFileName)));
            Assert.True(File.Exists(Path.Combine(result.DataDirectory, "manifest.js")));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static string NewDirectory() => Path.Combine(Path.GetTempPath(), "canopyx-streamed-" + Guid.NewGuid().ToString("N"));

    private static List<string> RelativeFiles(string directory) =>
        Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).Select(file => Path.GetRelativePath(directory, file)).OrderBy(file => file, StringComparer.Ordinal).ToList();

    private static CanopyTreeView View() {
        var view = new CanopyTreeView("streamed", "Streamed") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        return view;
    }

    /// <summary>A deterministic tree by id: 3 roots, 230 folders each, and under each folder a file and a detail row.</summary>
    private static IEnumerable<CanopyNode> ChildrenOf(string? parent) {
        if (parent == null) {
            for (var root = 0; root < 3; root++) {
                yield return new CanopyNode("r" + root, "Root " + root) { Kind = "root", Group = true };
            }
        } else if (parent.Length == 2) {
            for (var folder = 0; folder < 230; folder++) {
                var node = new CanopyNode(parent + "/" + folder, "Folder " + folder + " of " + parent) { Kind = "folder" };
                node.Cells["size"] = 1000L + folder;
                yield return node;
            }
        } else if (!parent.EndsWith("/a", StringComparison.Ordinal)) {
            yield return new CanopyNode(parent + "/a", "File of " + parent) { Kind = "file" };
            yield return new CanopyNode(parent + "/detail", "Detail") { Detail = new CanopyPropertiesDetail().Add("Owner", "Team " + parent) };
        }
    }

    private static void Attach(CanopyNode node) {
        var pending = new Stack<CanopyNode>();
        pending.Push(node);
        while (pending.Count > 0) {
            var current = pending.Pop();
            if (current.Detail != null) continue;
            foreach (var child in ChildrenOf(current.Id)) {
                current.Children.Add(child);
                pending.Push(child);
            }
        }
    }

    /// <summary>A sequence that records whether its enumerator was disposed.</summary>
    private sealed class Tracked : IEnumerable<CanopyNode> {
        private readonly IEnumerable<CanopyNode> _nodes;

        internal Tracked(IEnumerable<CanopyNode> nodes) {
            _nodes = nodes;
        }

        internal bool Disposed { get; private set; }

        public IEnumerator<CanopyNode> GetEnumerator() {
            try {
                foreach (var node in _nodes) {
                    yield return node;
                }
            } finally {
                Disposed = true;
            }
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
