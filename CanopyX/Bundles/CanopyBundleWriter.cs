using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// Splits a view's tree into small sidecar script files that a page loads on demand, including from <c>file://</c>:
/// the top level in pages, each node's children in pages, a manifest, and a search index sharded by name prefix.
/// </summary>
/// <remarks>
/// The view's <see cref="CanopyView.Roots"/> must carry the complete tree as inline children. The layout is specified
/// under "Sidecar" in docs/data-protocol.md. Every page and shard file holds at most a set number of items and stays
/// within <see cref="CanopyBundleOptions.MaxFileBytes"/>. Files are written into the data folder and existing files are
/// not removed, so write each bundle into an empty folder. <c>CanopyX.Html</c> adds <c>SaveHtmlBundle</c>, which also
/// writes the page and the runtime assets.
/// </remarks>
public sealed class CanopyBundleWriter {
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

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
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or a node declares children that are not in the tree.</exception>
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

        var dataPath = Options.DataPath ?? "data/" + SafeFolder(view.Id) + "/";
        var dataDirectory = Path.GetFullPath(Path.Combine(outputDirectory, dataPath.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar)));
        var result = new CanopyBundleResult(CanopySource.Sidecar(dataPath), dataDirectory);
        using var layout = new CanopyBundleLayout();
        var context = new WriteContext(view, dataDirectory, layout, result);
        WritePages(context, null, new List<CanopyNode>(view.Roots), CanopyBundleLayout.RootPage);
        var search = view.Search != null ? new CanopySearchIndex() : null;
        WriteDescendants(context, search);
        SortedDictionary<string, int>? shards = null;
        if (search != null) {
            shards = new SortedDictionary<string, int>(StringComparer.Ordinal);
            foreach (var shard in search.Build(Options.SearchShardLimit)) {
                WriteShard(context, search, shard.Key, shard.Value, shards);
            }

            result.SearchShardCount = shards.Count;
        }

        WriteManifest(context, shards);
        return result;
    }

    /// <summary>Walks the tree depth first without recursion: writes every node's children pages and collects search entries.</summary>
    private void WriteDescendants(WriteContext context, CanopySearchIndex? search) {
        var pending = new Stack<(CanopyNode Node, string[] Path, string? Parent, string? Grandparent)>();
        for (var index = context.View.Roots.Count - 1; index >= 0; index--) {
            pending.Push((context.View.Roots[index], new[] { context.View.Roots[index].Id }, null, null));
        }

        while (pending.Count > 0) {
            var (node, path, parent, grandparent) = pending.Pop();
            context.Result.NodeCount++;
            if (search != null && node.Detail == null) {
                // The context names the nearest two ancestors; the full chain would repeat in every shard the entry is in.
                var where = parent == null ? null : grandparent == null ? parent : grandparent + " / " + parent;
                search.Add(new CanopySearchHit(path, node.Label) { Kind = node.Kind, Context = where });
            }

            var children = node.ChildNodes;
            if (children.Count == 0) {
                continue;
            }

            var parentId = node.Id;
            WritePages(context, parentId, children, page => context.Layout.ChildrenPage(parentId, page));
            for (var index = children.Count - 1; index >= 0; index--) {
                var child = children[index];
                var childPath = new string[path.Length + 1];
                Array.Copy(path, childPath, path.Length);
                childPath[path.Length] = child.Id;
                pending.Push((child, childPath, node.Label, parent));
            }
        }
    }

    /// <summary>Writes a list of nodes as pages of at most <see cref="CanopyBundleOptions.PageSize"/> nodes within the file budget.</summary>
    private void WritePages(WriteContext context, string? parentId, IReadOnlyList<CanopyNode> nodes, Func<int, string> reference) {
        var items = new List<string>(nodes.Count);
        foreach (var node in nodes) {
            var item = new CanopyJsonWriter(256);
            node.WriteJson(
                item,
                includeChildren: false,
                refOverride: node.HasInlineChildren ? context.Layout.ChildrenPage(node.Id, 0) : null,
                childCountOverride: node.HasInlineChildren ? node.ChildNodes.Count : (int?)null);
            items.Add(item.ToString());
        }

        var envelope = new CanopyJsonWriter(256);
        envelope.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", nodes.Count).Property("total", nodes.Count)
            .Name("items").BeginArray().EndArray().Name("next").String(reference(PageNumberBound(nodes.Count))).EndObject();
        var pages = Pack(items, Options.PageSize, Options.MaxFileBytes - FileOverhead(context, reference(0), envelope.ToString()));
        var offset = 0;
        for (var page = 0; page < pages.Count; page++) {
            var json = new CanopyJsonWriter(16384);
            json.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", offset).Property("total", nodes.Count).Name("items").BeginArray();
            foreach (var item in pages[page]) {
                json.Raw(item);
            }

            json.EndArray().Name("next").String(page + 1 < pages.Count ? reference(page + 1) : null).EndObject();
            WriteFile(context, reference(page), json.ToString());
            context.Result.PageCount++;
            offset += pages[page].Count;
        }
    }

    /// <summary>Writes one shard, in parts (key, key.2, key.3, ...) when it exceeds the entry limit or the file budget.</summary>
    private void WriteShard(WriteContext context, CanopySearchIndex search, string key, List<int> entries, SortedDictionary<string, int> written) {
        var items = new List<string>(entries.Count);
        foreach (var entry in entries) {
            var item = new CanopyJsonWriter(128);
            search.Entry(entry).WriteJson(item);
            items.Add(item.ToString());
        }

        var envelope = new CanopyJsonWriter(128);
        envelope.BeginObject().Envelope("searchShard").Property("key", key + ".99999").Name("entries").BeginArray().EndArray().EndObject();
        var parts = Pack(items, Options.SearchShardLimit, Options.MaxFileBytes - FileOverhead(context, CanopyBundleLayout.Shard(key + ".99999"), envelope.ToString()));
        for (var part = 0; part < parts.Count; part++) {
            var partKey = part == 0 ? key : key + "." + (part + 1).ToString(CultureInfo.InvariantCulture);
            var json = new CanopyJsonWriter(16384);
            json.BeginObject().Envelope("searchShard").Property("key", partKey).Name("entries").BeginArray();
            foreach (var item in parts[part]) {
                json.Raw(item);
            }

            json.EndArray().EndObject();
            WriteFile(context, CanopyBundleLayout.Shard(partKey), json.ToString());
            written[partKey] = parts[part].Count;
        }
    }

    /// <summary>
    /// Groups serialized items into runs of at most <paramref name="maxCount"/> whose UTF-8 size fits
    /// <paramref name="budget"/>. An item larger than the budget on its own still gets a file of its own.
    /// </summary>
    private static List<List<string>> Pack(List<string> items, int maxCount, int budget) {
        var parts = new List<List<string>>();
        var current = new List<string>();
        long bytes = 0;
        foreach (var item in items) {
            var size = Utf8.GetByteCount(item) + 1;
            if (current.Count > 0 && (current.Count >= maxCount || bytes + size > budget)) {
                parts.Add(current);
                current = new List<string>();
                bytes = 0;
            }

            current.Add(item);
            bytes += size;
        }

        if (current.Count > 0 || parts.Count == 0) {
            parts.Add(current);
        }

        return parts;
    }

    /// <summary>The bytes a file needs around its items: the sidecar wrapper plus the document envelope, measured exactly.</summary>
    private static int FileOverhead(WriteContext context, string reference, string emptyDocument) {
        var header = new CanopyJsonWriter(128);
        header.BeginArray().String(context.View.Id).String(reference).Raw(emptyDocument).EndArray();
        return Utf8.GetByteCount("(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + header.ToString() + ");\n") + 16;
    }

    /// <summary>A reference number no page list reaches, so the measured "next" is at least as long as any real one.</summary>
    private static int PageNumberBound(int count) => Math.Max(count, 1) * 10;

    private void WriteManifest(WriteContext context, SortedDictionary<string, int>? shards) {
        var json = new CanopyJsonWriter(shards == null ? 256 : 256 + shards.Count * 16);
        json.BeginObject().Envelope("manifest")
            .Property("view", context.View.Id)
            .Property("root", CanopyBundleLayout.RootPage(0))
            .Property("nodeCount", context.Result.NodeCount)
            .Property("pageSize", Options.PageSize);
        if (shards != null) {
            json.Name("search").BeginObject().Name("shards").BeginObject();
            foreach (var shard in shards) {
                json.Property(shard.Key, shard.Value);
            }

            json.EndObject().EndObject();
        }

        json.EndObject();
        WriteFile(context, CanopyBundleLayout.Manifest, json.ToString());
    }

    /// <summary>Writes one sidecar script: it pushes the view id, its own reference, and the document onto the queue.</summary>
    private static void WriteFile(WriteContext context, string reference, string document) {
        var header = new CanopyJsonWriter(128);
        header.BeginArray().String(context.View.Id).String(reference).Raw(document).EndArray();
        var content = "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + header.ToString() + ");\n";
        var path = Path.Combine(context.DataDirectory, reference.Replace('/', Path.DirectorySeparatorChar) + ".js");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var bytes = Utf8.GetBytes(content);
        File.WriteAllBytes(path, bytes);
        context.Result.FileCount++;
        context.Result.TotalBytes += bytes.Length;
        context.Result.LargestFileBytes = Math.Max(context.Result.LargestFileBytes, bytes.Length);
    }

    private static string SafeFolder(string id) {
        var builder = new StringBuilder(id.Length);
        foreach (var ch in id) {
            builder.Append((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' ? ch : '_');
        }

        return builder.ToString();
    }

    private sealed class WriteContext {
        internal WriteContext(CanopyView view, string dataDirectory, CanopyBundleLayout layout, CanopyBundleResult result) {
            View = view;
            DataDirectory = dataDirectory;
            Layout = layout;
            Result = result;
        }

        internal CanopyView View { get; }

        internal string DataDirectory { get; }

        internal CanopyBundleLayout Layout { get; }

        internal CanopyBundleResult Result { get; }
    }
}
