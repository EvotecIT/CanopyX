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
/// The view's <see cref="CanopyView.Roots"/> must carry the complete tree as inline children. The layout is specified
/// under "Sidecar" in docs/data-protocol.md. Every file stays within <see cref="CanopyBundleOptions.MaxFileBytes"/>,
/// apart from a file that holds a single node or search entry larger than the budget. Files are written into the data folder and existing files are
/// not removed, so write each bundle into an empty folder. <c>CanopyX.Html</c> adds <c>SaveHtmlBundle</c>, which also
/// writes the page and the runtime assets.
/// </remarks>
public sealed class CanopyBundleWriter {
    /// <summary>Creates a writer.</summary>
    /// <param name="options">Page size, search shard limit, file budget, and data folder; defaults apply when null.</param>
    public CanopyBundleWriter(CanopyBundleOptions? options = null) {
        Options = options ?? new CanopyBundleOptions();
    }

    /// <summary>Gets the options.</summary>
    public CanopyBundleOptions Options { get; }

    /// <summary>Writes the bundle.</summary>
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

        if (string.IsNullOrEmpty(outputDirectory)) {
            throw new ArgumentException("Output directory is required.", nameof(outputDirectory));
        }

        CanopyViewValidator.Validate(view, requireCompleteTree: true);
        if (view.Search != null && view.Search.MinLength < 2) {
            throw new InvalidOperationException("View '" + view.Id + "' is written as a bundle, whose search shards need queries of at least 2 characters.");
        }

        var dataPath = BundlePaths.DataPath(view.Id, Options.DataPath);
        var dataDirectory = Path.GetFullPath(Path.Combine(outputDirectory, dataPath.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar)));
        var result = new CanopyBundleResult(CanopySource.Sidecar(dataPath), dataDirectory);
        var context = new CanopyBundleContext(view, Options, dataDirectory, result);
        var search = view.Search != null ? new CanopySearchIndex() : null;
        var packs = new CanopyBundlePacks(context);
        WriteTree(context, packs, search, view.Roots);
        packs.Flush();
        result.PackCount = packs.Count;
        CanopySearchIndexWriter? index = null;
        if (search != null) {
            index = new CanopySearchIndexWriter(context, search);
            index.Write();
        }

        WriteManifest(context, index);
        return result;
    }

    /// <summary>
    /// Walks the tree depth first without recursion. A node is serialized once the pages of its children are written,
    /// because it carries the reference of their first page; so the pages of a subtree end up next to each other in
    /// the packs, and only the serialized children of the nodes on the current path are held in memory.
    /// </summary>
    private void WriteTree(CanopyBundleContext context, CanopyBundlePacks packs, CanopySearchIndex? search, IEnumerable<CanopyNode> roots) {
        var open = new Stack<Level>();
        try {
            open.Push(new Level(null, -1, roots.GetEnumerator()));
            while (open.Count > 0) {
                var level = open.Peek();
                if (level.Nodes.MoveNext()) {
                    var node = level.Nodes.Current;
                    context.Result.NodeCount++;
                    // Every node gets an entry, searchable or not, because the id path of a hit runs through its ancestors.
                    var entry = search == null ? -1 : search.Add(level.Entry, node.Id, node.Label, node.Kind);
                    if (node.HasInlineChildren) {
                        open.Push(new Level(node, entry, node.ChildNodes.GetEnumerator()));
                    } else {
                        level.Items.Add(Serialize(node, null, 0));
                    }

                    continue;
                }

                open.Pop();
                level.Nodes.Dispose();
                if (level.Node == null) {
                    WriteRootPages(context, level.Items);
                } else {
                    var first = WritePackedPages(context, packs, level.Node.Id, level.Items);
                    open.Peek().Items.Add(Serialize(level.Node, first, level.Items.Count));
                }
            }
        } finally {
            // After a failure the levels that are still open hold enumerators the caller may need released.
            while (open.Count > 0) {
                open.Pop().Nodes.Dispose();
            }
        }
    }

    private static string Serialize(CanopyNode node, string? childrenReference, int childCount) {
        var item = new CanopyJsonWriter(256);
        node.WriteJson(item, includeChildren: false, refOverride: childrenReference, childCountOverride: childCount > 0 ? childCount : (int?)null);
        return item.ToString();
    }

    /// <summary>Writes the top-level nodes as the files <c>r/0</c>, <c>r/1</c>, and so on.</summary>
    private void WriteRootPages(CanopyBundleContext context, List<string> items) {
        var budget = context.ItemBudget(CanopyBundleLayout.RootPage(0), Page(null, items.Count, items.Count, null, CanopyBundleLayout.RootPage(Math.Max(items.Count, 1))));
        var pages = Split(items, Options.PageSize, budget);
        var offset = 0;
        for (var page = 0; page < pages.Count; page++) {
            var next = page + 1 < pages.Count ? CanopyBundleLayout.RootPage(page + 1) : null;
            context.WriteFile(CanopyBundleLayout.RootPage(page), Page(null, offset, items.Count, pages[page], next));
            context.Result.PageCount++;
            offset += pages[page].Count;
        }
    }

    /// <summary>
    /// Adds the pages of one node's children to the packs and returns the reference of the first page. The pages are
    /// added last to first, because each page names the one after it.
    /// </summary>
    private string WritePackedPages(CanopyBundleContext context, CanopyBundlePacks packs, string parentId, List<string> items) {
        // A continuation no bundle reaches, so the measured envelope is never too short.
        var envelope = Page(parentId, items.Count, items.Count, null, CanopyBundleLayout.PackedPage(int.MaxValue, int.MaxValue));
        var budget = packs.Budget - CanopyBundlePacks.SizeOf(envelope);
        if (budget <= 0) {
            throw new InvalidOperationException("The children page of '" + parentId + "' has a fixed envelope that exceeds MaxFileBytes; shorten identifiers or increase the budget.");
        }

        var pages = Split(items, Options.PageSize, (int)budget);
        var offset = items.Count;
        string? next = null;
        for (var page = pages.Count - 1; page >= 0; page--) {
            offset -= pages[page].Count;
            next = packs.Add(Page(parentId, offset, items.Count, pages[page], next));
            context.Result.PageCount++;
        }

        return next!;
    }

    private static string Page(string? parentId, int offset, int total, List<string>? items, string? next) {
        var json = new CanopyJsonWriter(items == null ? 256 : 16384);
        json.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", offset).Property("total", total).Name("items").BeginArray();
        if (items != null) {
            foreach (var item in items) {
                json.Raw(item);
            }
        }

        return json.EndArray().Name("next").String(next).EndObject().ToString();
    }

    /// <summary>
    /// Groups serialized items into runs of at most <paramref name="maxCount"/> whose UTF-8 size fits
    /// <paramref name="budget"/>. An item larger than the budget on its own still gets a page of its own, and a list
    /// without items still gets one empty page.
    /// </summary>
    private static List<List<string>> Split(List<string> items, int maxCount, int budget) {
        var pages = new List<List<string>>();
        var current = new List<string>();
        long bytes = 0;
        foreach (var item in items) {
            var size = CanopyBundleContext.Utf8.GetByteCount(item) + 1;
            if (current.Count > 0 && (current.Count >= maxCount || bytes + size > budget)) {
                pages.Add(current);
                current = new List<string>();
                bytes = 0;
            }

            current.Add(item);
            bytes += size;
        }

        if (current.Count > 0 || pages.Count == 0) {
            pages.Add(current);
        }

        return pages;
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

    /// <summary>The children of one open node (or the top level) while their subtrees are written.</summary>
    private sealed class Level {
        internal Level(CanopyNode? node, int entry, IEnumerator<CanopyNode> nodes) {
            Node = node;
            Entry = entry;
            Nodes = nodes;
        }

        /// <summary>Gets the node whose children these are, or null for the top level.</summary>
        internal CanopyNode? Node { get; }

        /// <summary>Gets the node's search entry number, or -1.</summary>
        internal int Entry { get; }

        internal IEnumerator<CanopyNode> Nodes { get; }

        /// <summary>Gets the serialized children finished so far.</summary>
        internal List<string> Items { get; } = new List<string>();
    }
}
