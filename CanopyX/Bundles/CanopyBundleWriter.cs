using System;
using System.Collections.Generic;
using System.IO;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// Splits a view's tree into sidecar script files that a page loads on demand, including from <c>file://</c>: the top
/// level in pages, the children pages of all other nodes packed together into pack files, a manifest, and a search
/// index that holds every node once next to word shards that refer to it.
/// </summary>
/// <remarks>
/// The tree comes either from the view's <see cref="CanopyView.Roots"/>, complete with inline children, or from the
/// host node by node while the writer walks it (see
/// <see cref="Write(CanopyView, string, IEnumerable{CanopyNode}, Func{CanopyNode, IEnumerable{CanopyNode}})"/>), so a
/// tree that does not fit in memory can be written from a database or a file. The layout is specified under
/// "Sidecar" in docs/data-protocol.md. Children packs are filled to <see cref="CanopyBundleOptions.ChildPackBytes"/>.
/// Every file stays within <see cref="CanopyBundleOptions.MaxFileBytes"/>, apart
/// from a file that holds a single node or search entry larger than the budget. Files are written into the data folder
/// and existing files are not removed, so write each bundle into an empty folder. <c>CanopyX.Html</c> adds
/// <c>SaveHtmlBundle</c>, which also writes the page and the runtime assets.
/// </remarks>
public sealed class CanopyBundleWriter {
    /// <summary>Creates a writer.</summary>
    /// <param name="options">Page size, search shard limit, file budget, and data folder; defaults apply when null.</param>
    public CanopyBundleWriter(CanopyBundleOptions? options = null) {
        Options = options ?? new CanopyBundleOptions();
    }

    /// <summary>Gets the options.</summary>
    public CanopyBundleOptions Options { get; }

    /// <summary>Writes the bundle of a tree that is complete in memory.</summary>
    /// <param name="view">The view; its roots carry the complete tree.</param>
    /// <param name="outputDirectory">The folder the page lives in; the data folder is created inside it.</param>
    /// <returns>The sidecar source to assign to the view, and the sizes written.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="outputDirectory"/> is null or empty.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, a node declares children that are not in the tree, or the fixed part of a file exceeds the file budget.</exception>
    public CanopyBundleResult Write(CanopyView view, string outputDirectory) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        // The whole tree is checked before the first file is written.
        CanopyViewValidator.Validate(view, requireCompleteTree: true);
        return WriteBundle(view, outputDirectory, view.Roots, null);
    }

    /// <summary>
    /// Writes the bundle of a tree the host supplies while the writer walks it, so the tree never has to be in memory
    /// as a whole.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The writer reads <paramref name="roots"/> once. For every node that has no inline
    /// <see cref="CanopyNode.Children"/> and is not a detail row, it calls <paramref name="children"/> once, right
    /// after it read the node, and reads the returned sequence once, to its end, before it reads the node's next
    /// sibling. A node with inline children is walked as it is. The writer decides whether a node has children from
    /// what it read, so <see cref="CanopyNode.HasChildren"/>, <see cref="CanopyNode.ChildCount"/>, and
    /// <see cref="CanopyNode.Ref"/> are ignored.
    /// </para>
    /// <para>
    /// A node is released once its subtree is written. The writer keeps the serialized rows of the lists on the path
    /// it is on (each list until its last node is read, so one very long list is held whole), one id per node to
    /// reject duplicates, the words of the search index with one number per word of every label search can find, the
    /// search entries of the top-level node it is in until that node is finished (an entry names the pages on its
    /// path, which are known once each list on it is complete), and, when the index is packed, its serialized shards
    /// until the end. The cells and details of the rest of the tree are not held.
    /// </para>
    /// <para>
    /// A node's id, icon, cells, badges, and flags are checked when it arrives, and its detail when its row is
    /// written, which is after its subtree. After a failure the data folder holds the files written so far and no
    /// manifest, so nothing can open it; delete the folder before writing again.
    /// </para>
    /// </remarks>
    /// <param name="view">The view. Its <see cref="CanopyView.Roots"/> must be empty.</param>
    /// <param name="outputDirectory">The folder the page lives in; the data folder is created inside it.</param>
    /// <param name="roots">The top-level nodes in display order.</param>
    /// <param name="children">Returns the children of a node in display order, or null or an empty sequence for a leaf.</param>
    /// <returns>The sidecar source to assign to the view, and the sizes written.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/>, <paramref name="roots"/>, or <paramref name="children"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="outputDirectory"/> is null or empty, or the view has roots of its own.</exception>
    /// <exception cref="InvalidOperationException">The view or a node breaks a protocol rule, two nodes have the same id, or the fixed part of a file exceeds the file budget.</exception>
    public CanopyBundleResult Write(CanopyView view, string outputDirectory, IEnumerable<CanopyNode> roots, Func<CanopyNode, IEnumerable<CanopyNode>?> children) {
        if (view == null) {
            throw new ArgumentNullException(nameof(view));
        }

        if (roots == null) {
            throw new ArgumentNullException(nameof(roots));
        }

        if (children == null) {
            throw new ArgumentNullException(nameof(children));
        }

        if (view.Roots.Count > 0) {
            throw new ArgumentException("The view has roots of its own; pass the top-level nodes either on the view or as the roots argument, not both.", nameof(view));
        }

        return WriteBundle(view, outputDirectory, roots, new Incoming(view, children, CanopyViewValidator.ValidateDefinition(view, bundle: true)));
    }

    private CanopyBundleResult WriteBundle(CanopyView view, string outputDirectory, IEnumerable<CanopyNode> roots, Incoming? incoming) {
        if (string.IsNullOrEmpty(outputDirectory)) {
            throw new ArgumentException("Output directory is required.", nameof(outputDirectory));
        }

        if (view.Search != null && view.Search.MinLength < 2) {
            throw new InvalidOperationException("View '" + view.Id + "' is written as a bundle, whose search shards need queries of at least 2 characters.");
        }

        var dataPath = BundlePaths.DataPath(view.Id, Options.DataPath);
        var dataDirectory = Path.GetFullPath(Path.Combine(outputDirectory, dataPath.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar)));
        var result = new CanopyBundleResult(CanopySource.Sidecar(dataPath), dataDirectory);
        var context = new CanopyBundleContext(view, Options, dataDirectory, result);
        var index = view.Search != null ? new CanopySearchIndexWriter(context, new CanopySearchIndex()) : null;
        var packs = new CanopyBundlePacks(context, CanopyBundleLayout.Pack, Options.ChildPackBytes);
        WriteTree(context, packs, index, roots, incoming);
        packs.Flush();
        result.PackCount = packs.Count;
        index?.Write();
        WriteManifest(context, index);
        return result;
    }

    /// <summary>
    /// Walks the tree depth first without recursion. A node is serialized once the pages of its children are written,
    /// because it carries the reference of their first page; so the pages of a subtree end up next to each other in
    /// the packs, and only the serialized children of the nodes on the current path are held in memory.
    /// </summary>
    private void WriteTree(CanopyBundleContext context, CanopyBundlePacks packs, CanopySearchIndexWriter? index, IEnumerable<CanopyNode> roots, Incoming? incoming) {
        var open = new Stack<Level>();
        // Top-level nodes are paged as they are finished, so the search index learns the page of each at once.
        var top = new Pager(Options.PageSize, RootPageBudget(context));
        try {
            open.Push(new Level(null, roots.GetEnumerator(), 0));
            while (open.Count > 0) {
                var level = open.Peek();
                if (level.Nodes.MoveNext()) {
                    var node = level.Nodes.Current;
                    incoming?.Check(node, level.Node);
                    context.Result.NodeCount++;
                    index?.Add(node.Id, node.Label, node.Kind);
                    var children = node.HasInlineChildren ? node.ChildNodes : incoming?.ChildrenOf(node);
                    if (children != null) {
                        index?.Open();
                        open.Push(new Level(node, children.GetEnumerator(), node.HasInlineChildren ? node.ChildNodes.Count : 0));
                    } else {
                        AddItem(level, Serialize(context, node, null, 0), top, index);
                    }

                    continue;
                }

                open.Pop();
                level.Nodes.Dispose();
                if (level.Node == null) {
                    WriteRootPages(context, top);
                } else {
                    // A node whose children turned out to be an empty sequence is a leaf.
                    var pages = level.Items.Count > 0 ? WritePackedPages(context, packs, level.Node.Id, level.Items) : null;
                    index?.Close(pages);
                    AddItem(open.Peek(), Serialize(context, level.Node, pages?[0].Reference, level.Items.Count), top, index);
                }
            }
        } finally {
            // Levels are still open only after a failure. Their enumerators belong to the host and are released;
            // one that fails to close must not replace the failure being reported or keep the others open.
            while (open.Count > 0) {
                try {
                    open.Pop().Nodes.Dispose();
                } catch (Exception) {
                    // The original exception is already on its way to the caller.
                }
            }
        }
    }

    private static string Serialize(CanopyBundleContext context, CanopyNode node, string? childrenReference, int childCount) {
        var item = context.ItemWriter.Reset();
        node.WriteBundleItem(item, childrenReference, childCount);
        return item.ToString();
    }

    /// <summary>Adds a finished node's item to its parent's list; a top-level item goes to its page at once.</summary>
    private static void AddItem(Level level, string item, Pager top, CanopySearchIndexWriter? index) {
        if (level.Node != null) {
            level.Items.Add(item);
            return;
        }

        var page = top.Add(item);
        index?.PlaceTopLevel(CanopyBundleLayout.RootPage(page));
    }

    /// <summary>The bytes a top-level page has for its items, with an envelope as long as any top-level page can get.</summary>
    private static int RootPageBudget(CanopyBundleContext context) =>
        context.ItemBudget(CanopyBundleLayout.RootPage(int.MaxValue), CanopyBundleDocument.PageEnvelope(null, int.MaxValue, int.MaxValue, CanopyBundleLayout.RootPage(int.MaxValue)));

    /// <summary>Writes the top-level nodes as the files <c>r/0</c>, <c>r/1</c>, and so on.</summary>
    private void WriteRootPages(CanopyBundleContext context, Pager top) {
        var pages = top.Pages;
        var total = 0;
        foreach (var page in pages) {
            total += page.Count;
        }

        var offset = 0;
        for (var page = 0; page < pages.Count; page++) {
            var next = page + 1 < pages.Count ? CanopyBundleLayout.RootPage(page + 1) : null;
            context.WriteFile(CanopyBundleLayout.RootPage(page), CanopyBundleDocument.Page(null, offset, total, pages[page], top.PageBytes(page), next).Parts());
            context.Result.PageCount++;
            offset += pages[page].Count;
        }
    }

    /// <summary>
    /// Adds the pages of one node's children to the packs and returns the reference and item count of each page, first
    /// page first. The pages are added last to first, because each page names the one after it. Pages are split to fit
    /// the file budget, not the pack size, so the pack size changes which pages share a file and never how a list is
    /// paged. The pages of one list stay together (see <see cref="CanopyBundlePacks.StartList"/>).
    /// </summary>
    private List<(string Reference, int Count)> WritePackedPages(CanopyBundleContext context, CanopyBundlePacks packs, string parentId, List<string> items) {
        // A continuation no bundle reaches, so the measured envelope is never too short.
        var envelope = CanopyBundleDocument.PageEnvelope(parentId, items.Count, items.Count, CanopyBundleLayout.PackedPage(int.MaxValue, int.MaxValue));
        var budget = packs.FileBudget - CanopyBundlePacks.SizeOf(envelope);
        if (budget <= 0) {
            throw new InvalidOperationException("The children page of '" + parentId + "' has a fixed envelope that exceeds MaxFileBytes; shorten identifiers or increase the budget.");
        }

        var pager = Split(items, Options.PageSize, (int)budget);
        var pages = pager.Pages;
        packs.StartList(pager.Bytes + pages.Count * CanopyBundlePacks.SizeOf(envelope));
        var written = new (string Reference, int Count)[pages.Count];
        var offset = items.Count;
        string? next = null;
        for (var page = pages.Count - 1; page >= 0; page--) {
            offset -= pages[page].Count;
            next = packs.AddListPage(CanopyBundleDocument.Page(parentId, offset, items.Count, pages[page], pager.PageBytes(page), next));
            written[page] = (next, pages[page].Count);
            context.Result.PageCount++;
        }

        return new List<(string Reference, int Count)>(written);
    }

    /// <summary>
    /// Groups serialized items into runs of at most <paramref name="maxCount"/> whose UTF-8 size fits
    /// <paramref name="budget"/>. An item larger than the budget on its own still gets a page of its own, and a list
    /// without items still gets one empty page.
    /// </summary>
    private static Pager Split(List<string> items, int maxCount, int budget) {
        var pager = new Pager(maxCount, budget);
        foreach (var item in items) {
            pager.Add(item);
        }

        return pager;
    }

    private void WriteManifest(CanopyBundleContext context, CanopySearchIndexWriter? index) {
        var json = new CanopyJsonWriter(1024);
        json.BeginObject().Envelope("manifest")
            .Property("view", context.View.Id)
            .Property("root", CanopyBundleLayout.RootPage(0))
            .Property("nodeCount", context.Result.NodeCount)
            .Property("pageSize", Options.PageSize)
            .Property("packs", context.Result.PackCount);
        index?.WriteManifest(json);
        json.EndObject();
        context.WriteFile(CanopyBundleLayout.Manifest, json.ToString());
    }

    /// <summary>
    /// Pages a list as its items arrive: a page ends before the item that would take it past the item count or the
    /// byte budget. An item larger than the budget on its own still gets a page of its own.
    /// </summary>
    private sealed class Pager {
        private readonly int _maxCount;
        private readonly int _budget;
        private readonly List<List<string>> _pages = new List<List<string>>();
        /// <summary>The size of the items of each page with a comma each.</summary>
        private readonly List<long> _pageBytes = new List<long>();
        private List<string>? _current;

        internal Pager(int maxCount, int budget) {
            _maxCount = maxCount;
            _budget = budget;
        }

        /// <summary>Gets the size of all items so far, with a comma each.</summary>
        internal long Bytes { get; private set; }

        /// <summary>Gets the pages; a list without items has one empty page.</summary>
        internal List<List<string>> Pages => _pages.Count > 0 ? _pages : new List<List<string>> { new List<string>() };

        /// <summary>Gets the size of the items of a page of <see cref="Pages"/>, with a comma each.</summary>
        internal long PageBytes(int page) => page < _pageBytes.Count ? _pageBytes[page] : 0;

        /// <summary>Adds an item and returns the number of its page, from 0.</summary>
        internal int Add(string item) {
            var size = CanopyBundleContext.Utf8.GetByteCount(item) + 1;
            Bytes += size;
            if (_current == null || _current.Count >= _maxCount || _pageBytes[_pageBytes.Count - 1] + size > _budget) {
                _current = new List<string>();
                _pages.Add(_current);
                _pageBytes.Add(0);
            }

            _current.Add(item);
            _pageBytes[_pageBytes.Count - 1] += size;
            return _pages.Count - 1;
        }
    }

    /// <summary>The children of one open node (or the top level) while their subtrees are written.</summary>
    private sealed class Level {
        /// <param name="node">The node whose children these are, or null for the top level.</param>
        /// <param name="nodes">The children.</param>
        /// <param name="count">How many children there are, when that is known; zero otherwise.</param>
        internal Level(CanopyNode? node, IEnumerator<CanopyNode> nodes, int count) {
            Node = node;
            Nodes = nodes;
            Items = new List<string>(count);
        }

        /// <summary>Gets the node whose children these are, or null for the top level.</summary>
        internal CanopyNode? Node { get; }

        internal IEnumerator<CanopyNode> Nodes { get; }

        /// <summary>Gets the serialized children finished so far.</summary>
        internal List<string> Items { get; }
    }

    /// <summary>
    /// The host's side of a streamed write: where children come from, and the checks a complete tree gets up front
    /// from <see cref="CanopyViewValidator"/>, made here on each node as it arrives.
    /// </summary>
    private sealed class Incoming {
        private readonly CanopyView _view;
        private readonly Func<CanopyNode, IEnumerable<CanopyNode>?> _children;
        private readonly HashSet<string> _columns;
        private readonly HashSet<string> _ids = new HashSet<string>(StringComparer.Ordinal);

        internal Incoming(CanopyView view, Func<CanopyNode, IEnumerable<CanopyNode>?> children, HashSet<string> columns) {
            _view = view;
            _children = children;
            _columns = columns;
        }

        internal void Check(CanopyNode? node, CanopyNode? parent) {
            if (node == null) {
                throw new InvalidOperationException(parent == null ? "The top level of view '" + _view.Id + "' has a null node." : "Node '" + parent.Id + "' has a null child.");
            }

            if (!_ids.Add(node.Id)) {
                throw new InvalidOperationException("View '" + _view.Id + "' has more than one node with id '" + node.Id + "'.");
            }

            CanopyViewValidator.ValidateNodeAgainstView(_view, _columns, node);
            node.ValidateContent();
        }

        /// <summary>A detail row is a leaf, so the host is not asked for its children.</summary>
        internal IEnumerable<CanopyNode>? ChildrenOf(CanopyNode node) => node.Detail == null ? _children(node) : null;
    }
}
