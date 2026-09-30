using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// Splits a view's tree into small sidecar script files that a page loads on demand, including from <c>file://</c>:
/// the top level in pages, each node's children in pages, a manifest, and a search index that holds every node once
/// next to word shards that refer to it.
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
        using var layout = new CanopyBundleLayout();
        var context = new CanopyBundleContext(view, Options, dataDirectory, layout, result);
        WritePages(context, null, new List<CanopyNode>(view.Roots), CanopyBundleLayout.RootPage);
        var search = view.Search != null ? new CanopySearchIndex() : null;
        WriteDescendants(context, search);
        CanopySearchIndexWriter? index = null;
        if (search != null) {
            index = new CanopySearchIndexWriter(context, search);
            index.Write();
        }

        WriteManifest(context, index);
        return result;
    }

    /// <summary>Walks the tree depth first without recursion: writes every node's children pages and collects search entries.</summary>
    private void WriteDescendants(CanopyBundleContext context, CanopySearchIndex? search) {
        var pending = new Stack<(CanopyNode Node, int Parent)>();
        for (var index = context.View.Roots.Count - 1; index >= 0; index--) {
            pending.Push((context.View.Roots[index], -1));
        }

        while (pending.Count > 0) {
            var (node, parent) = pending.Pop();
            context.Result.NodeCount++;
            // Every node gets an entry, searchable or not, because the id path of a hit runs through its ancestors.
            var number = search == null ? -1 : search.Add(parent, node.Id, node.Label, node.Kind);
            var children = node.ChildNodes;
            if (children.Count == 0) {
                continue;
            }

            var parentId = node.Id;
            WritePages(context, parentId, children, page => context.Layout.ChildrenPage(parentId, page));
            for (var index = children.Count - 1; index >= 0; index--) {
                pending.Push((children[index], number));
            }
        }
    }

    /// <summary>Writes a list of nodes as pages of at most <see cref="CanopyBundleOptions.PageSize"/> nodes within the file budget.</summary>
    private void WritePages(CanopyBundleContext context, string? parentId, IReadOnlyList<CanopyNode> nodes, Func<int, string> reference) {
        var envelope = new CanopyJsonWriter(256);
        envelope.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", nodes.Count).Property("total", nodes.Count)
            .Name("items").BeginArray().EndArray().Name("next").String(reference(PageNumberBound(nodes.Count))).EndObject();
        using var pages = Pack(SerializeNodes(context, nodes), Options.PageSize, context.ItemBudget(reference(0), envelope.ToString())).GetEnumerator();
        var hasPage = pages.MoveNext();
        var offset = 0;
        var page = 0;
        while (hasPage) {
            var current = pages.Current;
            hasPage = pages.MoveNext();
            var json = new CanopyJsonWriter(16384);
            json.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", offset).Property("total", nodes.Count).Name("items").BeginArray();
            foreach (var item in current) {
                json.Raw(item);
            }

            json.EndArray().Name("next").String(hasPage ? reference(page + 1) : null).EndObject();
            context.WriteFile(reference(page), json.ToString());
            context.Result.PageCount++;
            offset += current.Count;
            page++;
        }
    }

    /// <summary>Serializes nodes only as the bounded page packer consumes them.</summary>
    private static IEnumerable<string> SerializeNodes(CanopyBundleContext context, IReadOnlyList<CanopyNode> nodes) {
        foreach (var node in nodes) {
            var item = new CanopyJsonWriter(256);
            node.WriteJson(
                item,
                includeChildren: false,
                refOverride: node.HasInlineChildren ? context.Layout.ChildrenPage(node.Id, 0) : null,
                childCountOverride: node.HasInlineChildren ? node.ChildNodes.Count : (int?)null);
            yield return item.ToString();
        }

    }

    /// <summary>
    /// Groups serialized items into runs of at most <paramref name="maxCount"/> whose UTF-8 size fits
    /// <paramref name="budget"/>. An item larger than the budget on its own still gets a file of its own.
    /// </summary>
    private static IEnumerable<List<string>> Pack(IEnumerable<string> items, int maxCount, int budget) {
        var emitted = false;
        var current = new List<string>();
        long bytes = 0;
        foreach (var item in items) {
            var size = CanopyBundleContext.Utf8.GetByteCount(item) + 1;
            if (current.Count > 0 && (current.Count >= maxCount || bytes + size > budget)) {
                yield return current;
                emitted = true;
                current = new List<string>();
                bytes = 0;
            }

            current.Add(item);
            bytes += size;
        }

        if (current.Count > 0 || !emitted) yield return current;
    }

    /// <summary>A reference number no page list reaches, so the measured "next" is at least as long as any real one.</summary>
    private static int PageNumberBound(int count) => Math.Max(count, 1);

    private void WriteManifest(CanopyBundleContext context, CanopySearchIndexWriter? index) {
        var json = new CanopyJsonWriter(1024);
        json.BeginObject().Envelope("manifest")
            .Property("view", context.View.Id)
            .Property("root", CanopyBundleLayout.RootPage(0))
            .Property("nodeCount", context.Result.NodeCount)
            .Property("pageSize", Options.PageSize);
        index?.WriteManifest(json);
        json.EndObject();
        context.WriteFile(CanopyBundleLayout.Manifest, json.ToString());
    }
}
