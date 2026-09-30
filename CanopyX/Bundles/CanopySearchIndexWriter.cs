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
internal sealed class CanopySearchIndexWriter {
    /// <summary>
    /// The most entries one entry file holds. A query loads the files of its first matches only, so small files keep
    /// a query whose matches are spread across the tree from loading much more than it shows.
    /// </summary>
    internal const int EntriesPerFile = 256;

    private readonly CanopyBundleContext _context;
    private readonly CanopySearchIndex _index;
    private readonly List<int> _entryFiles = new List<int>();
    private readonly SortedDictionary<string, int> _shards = new SortedDictionary<string, int>(StringComparer.Ordinal);

    internal CanopySearchIndexWriter(CanopyBundleContext context, CanopySearchIndex index) {
        _context = context;
        _index = index;
    }

    /// <summary>Writes the entry files and the word shards.</summary>
    internal void Write() {
        WriteEntries();
        foreach (var shard in _index.BuildShards(_context.Options.SearchShardLimit)) {
            WriteShard(shard.Key, shard.Value);
        }

        _context.Result.SearchEntryFileCount = _entryFiles.Count;
        _context.Result.SearchShardCount = _shards.Count;
    }

    /// <summary>Writes the manifest's <c>search</c> object.</summary>
    internal void WriteManifest(CanopyJsonWriter json) {
        json.Name("search").BeginObject().Property("entryCount", _index.Entries.Count).Name("entryFiles").BeginArray();
        foreach (var first in _entryFiles) {
            json.Number(first);
        }

        json.EndArray().StringArray("kinds", _index.Kinds).Name("shards").BeginObject();
        foreach (var shard in _shards) {
            json.Property(shard.Key, shard.Value);
        }

        json.EndObject().EndObject();
    }

    /// <summary>
    /// Writes the entries in runs of consecutive numbers. Each file also carries its stem: the ancestors of its first
    /// entry. In depth-first order, an ancestor that lies before the file is an ancestor of the file's first entry, so
    /// the stem is exactly what the file needs to rebuild every id path on its own.
    /// </summary>
    private void WriteEntries() {
        var entries = _index.Entries;
        // A file number and a first entry number no real file reaches, so the measured envelope is never too short.
        var bound = Math.Max(entries.Count, 1);
        var first = 0;
        while (first < entries.Count) {
            var stem = new List<string>();
            for (var parent = entries[first].Parent; parent >= 0; parent = entries[parent].Parent) {
                stem.Add(Serialize(parent, withNumber: true));
            }

            stem.Reverse();
            var budget = _context.RemainingBytes(CanopyBundleLayout.EntryFile(bound), EntriesDocument(bound, stem, new List<string>()));
            var items = new List<string>();
            long bytes = 0;
            while (first + items.Count < entries.Count && items.Count < EntriesPerFile) {
                var item = Serialize(first + items.Count, withNumber: false);
                var size = CanopyBundleContext.Utf8.GetByteCount(item) + 1;
                if (items.Count > 0 && bytes + size > budget) {
                    break;
                }

                // An entry larger than the budget on its own still gets a file; a stem that crowds out an ordinary entry does not.
                if (size > budget && size <= _context.RemainingBytes(CanopyBundleLayout.EntryFile(bound), EntriesDocument(bound, new List<string>(), new List<string>()))) {
                    throw new InvalidOperationException("The search entries of view '" + _context.View.Id + "' need more than MaxFileBytes for the "
                        + stem.Count.ToString(CultureInfo.InvariantCulture) + " ancestors of one node; increase the budget or write the bundle without search.");
                }

                items.Add(item);
                bytes += size;
            }

            _context.Result.SearchIndexBytes += _context.WriteFile(CanopyBundleLayout.EntryFile(_entryFiles.Count), EntriesDocument(first, stem, items));
            _entryFiles.Add(first);
            first += items.Count;
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
    private string Serialize(int number, bool withNumber) {
        var entry = _index.Entries[number];
        var parentId = entry.Parent < 0 ? string.Empty : _index.Entries[entry.Parent].Id;
        SharedAffixes(parentId, entry.Id, out var head, out var tail);
        var json = new CanopyJsonWriter(96);
        json.BeginArray();
        if (withNumber) {
            json.Number(number);
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
        var budget = _context.ItemBudget(CanopyBundleLayout.Shard(bound), ShardDocument(bound, new ShardPart()));
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
        _context.Result.SearchIndexBytes += _context.WriteFile(CanopyBundleLayout.Shard(partKey), ShardDocument(partKey, part));
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
