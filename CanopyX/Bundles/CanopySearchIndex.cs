using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Bundles;

/// <summary>
/// Builds the sharded search index of a bundle. Every entry is filed under each distinct word of its label that has
/// at least two code units. A shard covers the words that start with one prefix; a shard with more entries than the
/// limit splits on a prefix one code unit longer, and words exactly as long as the old prefix move to a "-" shard.
/// A shard can still hold more entries than the limit (a very common word, or the longest prefix); the bundle writer
/// stores such a shard in parts.
/// </summary>
internal sealed class CanopySearchIndex {
    /// <summary>Prefixes stop growing here, so a pathological set of equal words cannot split forever.</summary>
    internal const int MaxPrefixLength = 12;

    private readonly List<CanopySearchHit> _entries = new List<CanopySearchHit>();
    private readonly List<KeyValuePair<string, int>> _words = new List<KeyValuePair<string, int>>();

    internal int EntryCount => _entries.Count;

    internal void Add(string label, Func<CanopySearchHit> createEntry) {
        var words = CanopySearchFolding.Words(label).Where(word => word.Length >= 2).ToArray();
        if (words.Length == 0) return;
        var index = _entries.Count;
        _entries.Add(createEntry());
        foreach (var word in words) _words.Add(new KeyValuePair<string, int>(word, index));
    }

    internal CanopySearchHit Entry(int index) => _entries[index];

    /// <summary>Returns shard keys, in ordinal order, with the entry indexes of each shard in document order.</summary>
    internal SortedDictionary<string, List<int>> Build(int limit) {
        var shards = new SortedDictionary<string, List<int>>(StringComparer.Ordinal);
        foreach (var group in _words.GroupBy(w => w.Key.Substring(0, 2), StringComparer.Ordinal)) {
            Split(group.Key, group.ToList(), limit, shards);
        }

        return shards;
    }

    private static void Split(string prefix, List<KeyValuePair<string, int>> words, int limit, SortedDictionary<string, List<int>> shards) {
        var entries = Distinct(words);
        var key = CanopySearchFolding.ShardKey(prefix);
        if (entries.Count <= limit || prefix.Length >= MaxPrefixLength) {
            shards[key] = entries;
            return;
        }

        var exact = words.Where(w => w.Key.Length == prefix.Length).ToList();
        if (exact.Count > 0) {
            shards[key + "-"] = Distinct(exact);
        }

        var longer = words.Where(w => w.Key.Length > prefix.Length);
        foreach (var group in longer.GroupBy(w => w.Key.Substring(0, prefix.Length + 1), StringComparer.Ordinal)) {
            Split(group.Key, group.ToList(), limit, shards);
        }
    }

    private static List<int> Distinct(List<KeyValuePair<string, int>> words) {
        var entries = new SortedSet<int>();
        foreach (var word in words) {
            entries.Add(word.Value);
        }

        return entries.ToList();
    }
}
