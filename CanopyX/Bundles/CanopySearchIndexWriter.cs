using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// Writes a bundle's search index (see "Search Index" in docs/data-protocol.md): the entry table in <c>e/&lt;n&gt;</c>
/// files, each carrying the ancestors its entries need, and the word shards in <c>s/k-&lt;key&gt;</c> files, whose
/// posting lists refer to entries by number. Every file stays within the bundle's file budget.
/// </summary>
/// <remarks>
/// Entries are written as the bundle writer walks the tree: <see cref="Add"/> takes the next node in depth-first
/// order, and <see cref="Open"/> and <see cref="Close"/> say when the node added last starts and stops being the
/// parent of the nodes that follow. Only the open ancestors and the entries of the file in progress are held.
/// </remarks>
internal sealed class CanopySearchIndexWriter {
    /// <summary>
    /// The most entries one entry file holds. A query loads the files of its first matches only, so small files keep
    /// a query whose matches are spread across the tree from loading much more than it shows.
    /// </summary>
    internal const int EntriesPerFile = 256;

    private readonly CanopyBundleContext _context;
    private readonly CanopySearchIndex _index;
    private readonly HashSet<string>? _kinds;
    private readonly List<int> _entryFiles = new List<int>();
    private readonly SortedDictionary<string, int> _shards = new SortedDictionary<string, int>(StringComparer.Ordinal);
    private readonly List<Node> _open = new List<Node>();
    private readonly List<string> _stem = new List<string>();
    private readonly List<string> _items = new List<string>();
    private readonly CanopyBundlePacks? _packs;
    private readonly List<int> _entryPacks = new List<int>();
    private readonly List<string> _shardPacks = new List<string>();
    /// <summary>The shard documents of a packed index, held until the last so they go into packs in ordinal key order; about the size of the shards.</summary>
    private readonly SortedDictionary<string, string>? _packedShards;

    /// <summary>
    /// The bytes a document costs more inside a pack than as a file of its own: the pack's envelope and the template
    /// around the document, less the wrapper of a file. Budgets leave room for it, so a document alone in a pack still
    /// fits the file budget.
    /// </summary>
    private readonly int _packOverhead;
    private Node? _last;
    private int _numbered;
    private int _count;
    private int _first;
    private int _budget;
    private long _bytes;

    internal CanopySearchIndexWriter(CanopyBundleContext context, CanopySearchIndex index) {
        _context = context;
        _index = index;
        var kinds = context.View.Search?.Kinds;
        _kinds = kinds != null && kinds.Count > 0 ? new HashSet<string>(kinds, StringComparer.Ordinal) : null;
        if (context.Options.SearchPackBytes > 0) {
            _packs = new CanopyBundlePacks(context, CanopyBundleLayout.IndexPack, context.Options.SearchPackBytes);
            _packedShards = new SortedDictionary<string, string>(StringComparer.Ordinal);
            _packOverhead = (int)CanopyBundlePacks.SizeOf(string.Empty) + (context.Options.MaxFileBytes - _packs.FileBudget);
        }
    }

    /// <summary>
    /// Takes the next node in depth-first order as a child of the innermost open node. A node the view's search can
    /// find gets an entry and its words are filed. Its ancestors get entries too, at that moment if they have none
    /// yet, because the id path of a hit runs through them; a node that cannot be found and has no such descendant
    /// gets none.
    /// </summary>
    /// <param name="id">The node id.</param>
    /// <param name="label">The node label.</param>
    /// <param name="kind">The node kind, if any.</param>
    /// <exception cref="InvalidOperationException">The ancestors of the node do not fit one entry file.</exception>
    internal void Add(string id, string label, string? kind) {
        _last = new Node(id, label, kind);
        if (_kinds != null && (kind == null || !_kinds.Contains(kind))) {
            return;
        }

        // Ancestors are numbered top down right before the node, so a parent always has the smaller number. The
        // numbered ones are always the outermost open nodes, so only the rest is visited.
        for (; _numbered < _open.Count; _numbered++) {
            Number(_open[_numbered], _numbered);
        }

        Number(_last, _open.Count);
        _index.File(_last.Number, label);
    }

    /// <summary>Makes the node added last the parent of the nodes that follow.</summary>
    internal void Open() {
        _open.Add(_last!);
        if (_last!.Number >= 0) {
            _numbered = _open.Count;
        }
    }

    /// <summary>Ends the children of the innermost open node.</summary>
    internal void Close() {
        _open.RemoveAt(_open.Count - 1);
        _numbered = Math.Min(_numbered, _open.Count);
    }

    /// <summary>Gives a node the next entry number and adds its entry to the file in progress.</summary>
    /// <param name="node">The node.</param>
    /// <param name="depth">How many of the open nodes are its ancestors.</param>
    private void Number(Node node, int depth) {
        var parent = depth > 0 ? _open[depth - 1] : null;
        node.Number = _count++;
        node.Parent = parent?.Number ?? -1;
        node.Kind = _index.KindNumber(node.KindName);
        var item = Serialize(node, parent?.Id ?? string.Empty, withNumber: false);
        var size = CanopyBundleContext.Utf8.GetByteCount(item) + 1;
        if (_items.Count > 0 && (_items.Count >= EntriesPerFile || _bytes + size > _budget)) {
            WriteEntryFile();
        }

        if (_items.Count == 0) {
            StartEntryFile(node.Number, size, depth);
        }

        _items.Add(item);
        _bytes += size;
    }

    /// <summary>Writes the last entry file and the word shards.</summary>
    internal void Write() {
        if (_items.Count > 0) {
            WriteEntryFile();
        }

        foreach (var shard in _index.BuildShards(_context.Options.SearchShardLimit)) {
            WriteShard(shard.Key, shard.Value);
        }

        if (_packs != null) {
            // Entry files and shards never share a pack, and shards go in ordinal key order, so a reader finds each
            // one from the first file or key of every pack.
            _packs.Flush();
            foreach (var shard in _packedShards!) {
                AddToPack(shard.Value, _shardPacks, shard.Key);
            }

            _packs.Flush();
            _context.Result.SearchPackCount = _packs.Count;
        }

        _context.Result.SearchEntryFileCount = _entryFiles.Count;
        _context.Result.SearchShardCount = _shards.Count;
    }

    /// <summary>Writes the manifest's <c>search</c> object.</summary>
    internal void WriteManifest(CanopyJsonWriter json) {
        json.Name("search").BeginObject().Property("entryCount", _count).Name("entryFiles").BeginArray();
        foreach (var first in _entryFiles) {
            json.Number(first);
        }

        json.EndArray().StringArray("kinds", _index.Kinds).Name("shards").BeginObject();
        foreach (var shard in _shards) {
            json.Property(shard.Key, shard.Value);
        }

        json.EndObject();
        if (_packs != null) {
            json.Name("entryPacks").BeginArray();
            foreach (var first in _entryPacks) {
                json.Number(first);
            }

            json.EndArray().StringArray("shardPacks", _shardPacks);
        }

        json.EndObject();
    }

    /// <summary>
    /// Starts a file of consecutive entries. Each file carries its stem: the ancestors of its first entry. In
    /// depth-first order, an ancestor that lies before the file is an ancestor of the file's first entry, so the stem
    /// is exactly what the file needs to rebuild every id path on its own.
    /// </summary>
    private void StartEntryFile(int first, int firstSize, int depth) {
        _first = first;
        _bytes = 0;
        _stem.Clear();
        for (var level = 0; level < depth; level++) {
            _stem.Add(Serialize(_open[level], level > 0 ? _open[level - 1].Id : string.Empty, withNumber: true));
        }

        // A file number and a first entry number no real file reaches, so the measured envelope is never too short.
        const int bound = int.MaxValue;
        var reference = CanopyBundleLayout.EntryFile(bound);
        _budget = _context.RemainingBytes(reference, EntriesDocument(bound, _stem, _items)) - _packOverhead;
        // An entry larger than the budget on its own still gets a file; a stem that crowds out an ordinary entry does not.
        if (firstSize > _budget && firstSize <= _context.RemainingBytes(reference, EntriesDocument(bound, new List<string>(), _items)) - _packOverhead) {
            throw new InvalidOperationException("The search entries of view '" + _context.View.Id + "' need more than MaxFileBytes for the "
                + _stem.Count.ToString(CultureInfo.InvariantCulture) + " ancestors of one node; increase the budget or write the bundle without search.");
        }
    }

    private void WriteEntryFile() {
        var document = EntriesDocument(_first, _stem, _items);
        if (_packs != null) {
            AddToPack(document, _entryPacks, _entryFiles.Count);
        } else {
            _context.Result.SearchIndexBytes += _context.WriteFile(CanopyBundleLayout.EntryFile(_entryFiles.Count), document);
        }

        _entryFiles.Add(_first);
        _items.Clear();
    }

    /// <summary>Adds an index document to the packs and records the first file or key of every pack it starts.</summary>
    private void AddToPack<T>(string document, List<T> firsts, T name) {
        var before = _packs!.Count;
        var pending = _packs.Pending;
        _packs.Add(document);
        _context.Result.SearchIndexBytes += CanopyBundlePacks.SizeOf(document);
        if (pending == 0 || _packs.Count != before) {
            firsts.Add(name);
        }
    }

    private static string EntriesDocument(int first, List<string> stem, List<string> entries) {
        var json = new CanopyJsonWriter(16384);
        json.BeginObject().Envelope("searchEntries").Property("first", first).Name("stem").BeginArray();
        foreach (var item in stem) {
            json.Raw(item);
        }

        json.EndArray().Name("entries").BeginArray();
        foreach (var item in entries) {
            json.Raw(item);
        }

        return json.EndArray().EndObject().ToString();
    }

    /// <summary>
    /// An entry as <c>[parent, head, id, tail, label]</c> plus the kind number when it has one; stem entries lead with
    /// their own number. The id is stored relative to the parent's id: <c>head</c> and <c>tail</c> count the leading
    /// and trailing code units the two share, and only the part between them is written. Path-style ids share a
    /// prefix with their parent and distinguished names share a suffix, so neither repeats on every level.
    /// </summary>
    private static string Serialize(Node entry, string parentId, bool withNumber) {
        SharedAffixes(parentId, entry.Id, out var head, out var tail);
        var json = new CanopyJsonWriter(96);
        json.BeginArray();
        if (withNumber) {
            json.Number(entry.Number);
        }

        json.Number(entry.Parent).Number(head).String(entry.Id.Substring(head, entry.Id.Length - head - tail)).Number(tail).String(entry.Label);
        if (entry.Kind >= 0) {
            json.Number(entry.Kind);
        }

        return json.EndArray().ToString();
    }

    /// <summary>Counts the leading and trailing code units an id shares with its parent's id, never splitting a surrogate pair.</summary>
    private static void SharedAffixes(string parent, string id, out int head, out int tail) {
        var max = Math.Min(parent.Length, id.Length);
        head = 0;
        while (head < max && parent[head] == id[head]) {
            head++;
        }

        if (head > 0 && char.IsHighSurrogate(id[head - 1])) {
            head--;
        }

        tail = 0;
        while (tail < max - head && parent[parent.Length - 1 - tail] == id[id.Length - 1 - tail]) {
            tail++;
        }

        if (tail > 0 && char.IsLowSurrogate(id[id.Length - tail])) {
            tail--;
        }
    }

    /// <summary>
    /// Writes one shard, in parts (key, key.2, key.3, ...) when it outgrows the file budget. A posting list that does
    /// not fit continues in the next part, where it starts again with a plain entry number.
    /// </summary>
    private void WriteShard(string key, List<string> words) {
        var bound = key + "." + int.MaxValue.ToString(CultureInfo.InvariantCulture);
        var budget = _context.ItemBudget(CanopyBundleLayout.Shard(bound), ShardDocument(bound, new ShardPart())) - _packOverhead;
        var part = new ShardPart();
        var partNumber = 1;
        foreach (var word in words) {
            var postings = _index.Postings(word);
            var wordJson = new CanopyJsonWriter(32).String(word).ToString();
            // The word and its comma, and the list's brackets and comma.
            var wordBytes = CanopyBundleContext.Utf8.GetByteCount(wordJson) + 4;
            var next = 0;
            while (next < postings.Count) {
                var start = postings[next].ToString(CultureInfo.InvariantCulture);
                if (part.Words.Count > 0 && part.Bytes + wordBytes + start.Length > budget) {
                    WritePart(key, partNumber++, part);
                    part = new ShardPart();
                }

                var list = new StringBuilder("[").Append(start);
                part.Bytes += wordBytes + start.Length;
                part.Postings++;
                next++;
                while (next < postings.Count) {
                    // A negative number -n stands for the n entries that follow the previous one without a gap.
                    var run = 0;
                    while (next + run < postings.Count && postings[next + run] == postings[next - 1] + run + 1) {
                        run++;
                    }

                    var taken = run >= 2 ? run : 1;
                    var token = (run >= 2 ? -run : postings[next] - postings[next - 1]).ToString(CultureInfo.InvariantCulture);
                    if (part.Bytes + token.Length + 1 > budget) {
                        break;
                    }

                    list.Append(',').Append(token);
                    part.Bytes += token.Length + 1;
                    part.Postings += taken;
                    next += taken;
                }

                part.Words.Add(wordJson);
                part.Lists.Add(list.Append(']').ToString());
                if (next < postings.Count) {
                    WritePart(key, partNumber++, part);
                    part = new ShardPart();
                }
            }
        }

        if (part.Words.Count > 0) {
            WritePart(key, partNumber, part);
        }
    }

    private void WritePart(string key, int number, ShardPart part) {
        var partKey = number == 1 ? key : key + "." + number.ToString(CultureInfo.InvariantCulture);
        if (_packedShards != null) {
            _packedShards[partKey] = ShardDocument(partKey, part);
        } else {
            _context.Result.SearchIndexBytes += _context.WriteFile(CanopyBundleLayout.Shard(partKey), ShardDocument(partKey, part));
        }

        _shards[partKey] = part.Postings;
    }

    private static string ShardDocument(string key, ShardPart part) {
        var json = new CanopyJsonWriter(16384);
        json.BeginObject().Envelope("searchShard").Property("key", key).Name("words").BeginArray();
        foreach (var word in part.Words) {
            json.Raw(word);
        }

        json.EndArray().Name("postings").BeginArray();
        foreach (var list in part.Lists) {
            json.Raw(list);
        }

        return json.EndArray().EndObject().ToString();
    }

    /// <summary>
    /// A node on the way through the tree. Entries are numbered in depth-first order, so a node's parent always has a
    /// smaller number than the node, and the runtime rebuilds the id path and context by following parents.
    /// </summary>
    private sealed class Node {
        internal Node(string id, string label, string? kindName) {
            Id = id;
            Label = label;
            KindName = kindName;
        }

        internal string Id { get; }

        internal string Label { get; }

        internal string? KindName { get; }

        /// <summary>Gets or sets the entry number, or -1 while the node has no entry.</summary>
        internal int Number { get; set; } = -1;

        /// <summary>Gets or sets the parent's entry number, or -1 for a top-level node.</summary>
        internal int Parent { get; set; } = -1;

        /// <summary>Gets or sets the position of the node's kind in the index's kind table, or -1 without a kind.</summary>
        internal int Kind { get; set; } = -1;
    }

    /// <summary>The words of one shard file with their serialized posting lists.</summary>
    private sealed class ShardPart {
        internal List<string> Words { get; } = new List<string>();

        internal List<string> Lists { get; } = new List<string>();

        /// <summary>Gets or sets the bytes the words and lists take in the file.</summary>
        internal long Bytes { get; set; }

        /// <summary>Gets or sets how many entries the lists refer to.</summary>
        internal int Postings { get; set; }
    }
}
