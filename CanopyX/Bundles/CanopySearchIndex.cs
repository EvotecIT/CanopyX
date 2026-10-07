using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Bundles;

/// <summary>
/// Collects the words of a bundle's search index: for each folded word the ascending numbers of the entries whose
/// label has that word (its postings). A label with a word is also filed under its label token, so the runtime finds
/// the labels equal to a query without reading them. The entries themselves are written as they arrive, by
/// <see cref="CanopySearchIndexWriter"/>, so this class holds numbers and distinct words, not nodes.
/// </summary>
/// <remarks>
/// Words are grouped into shards by prefix. A shard covers the words that start with one prefix of at least two code
/// units; a shard with more postings than the limit splits on a prefix one code unit longer, and the word exactly as
/// long as the old prefix moves to a "-" shard. A word of one code unit always has a "-" shard of its own. A shard
/// can still hold more postings than the limit (a very common word, or the longest prefix);
/// <see cref="CanopySearchIndexWriter"/> stores a shard in parts when it outgrows the file budget.
/// </remarks>
internal sealed class CanopySearchIndex {
    /// <summary>Prefixes stop growing here, so a pathological set of equal prefixes cannot split forever.</summary>
    internal const int MaxPrefixLength = 12;

    /// <summary>
    /// The most postings a shard of label tokens holds before it splits. A query reads the shard of exactly one
    /// token, so these shards stay small whatever the limit for words is.
    /// </summary>
    internal const int TokenShardLimit = 1000;

    private readonly List<string> _kinds = new List<string>();
    private readonly Dictionary<string, int> _kindNumbers = new Dictionary<string, int>(StringComparer.Ordinal);
    private readonly Dictionary<string, List<int>> _postings = new Dictionary<string, List<int>>(StringComparer.Ordinal);
    /// <summary>The words of the label being filed, and the buffer they are folded in; reused for every label.</summary>
    private readonly List<string> _words = new List<string>();
    private readonly StringBuilder _word = new StringBuilder();

    /// <summary>Gets the distinct node kinds in order of first appearance; entries refer to them by position.</summary>
    internal IReadOnlyList<string> Kinds => _kinds;

    /// <summary>Gets the ascending entry numbers filed under a word.</summary>
    internal IReadOnlyList<int> Postings(string word) => _postings[word];

    /// <summary>Files the words of a label under an entry number. Numbers must arrive in ascending order.</summary>
    /// <param name="number">The entry number.</param>
    /// <param name="label">The node label.</param>
    internal void File(int number, string label) {
        CanopySearchFolding.Words(label, _words, _word);
        foreach (var word in _words) {
            Post(word, number);
        }

        if (_words.Count > 0) {
            Post(CanopySearchFolding.LabelToken(label), number);
        }
    }

    /// <summary>
    /// Adds an entry number to a word's postings once. Numbers arrive in ascending order, so a word that appears again
    /// in the same label already ends its list with the number, and every posting list stays strictly ascending.
    /// </summary>
    private void Post(string word, int number) {
        if (!_postings.TryGetValue(word, out var postings)) {
            postings = new List<int>();
            _postings.Add(word, postings);
        } else if (postings[postings.Count - 1] == number) {
            return;
        }

        postings.Add(number);
    }

    /// <summary>Returns the shard keys in ordinal order, each with its words in ordinal order.</summary>
    /// <param name="limit">The most postings a shard holds before it splits on a longer prefix.</param>
    internal SortedDictionary<string, List<string>> BuildShards(int limit) {
        var words = new List<string>(_postings.Keys);
        words.Sort(StringComparer.Ordinal);
        var shards = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
        var longer = new List<string>(words.Count);
        foreach (var word in words) {
            if (word.Length == 1) {
                shards[CanopySearchFolding.ShardKey(word) + "-"] = new List<string> { word };
            } else {
                longer.Add(word);
            }
        }

        foreach (var group in GroupByPrefix(longer, 2)) {
            Split(group.Key, group.Value, group.Key[0] == CanopySearchFolding.LabelTokenMark ? Math.Min(limit, TokenShardLimit) : limit, shards);
        }

        return shards;
    }

    /// <summary>Returns the position of a kind in <see cref="Kinds"/>, adding it on first use; -1 for no kind.</summary>
    internal int KindNumber(string? kind) {
        if (kind == null) {
            return -1;
        }

        if (!_kindNumbers.TryGetValue(kind, out var number)) {
            number = _kinds.Count;
            _kinds.Add(kind);
            _kindNumbers.Add(kind, number);
        }

        return number;
    }

    private void Split(string prefix, List<string> words, int limit, SortedDictionary<string, List<string>> shards) {
        long postings = 0;
        foreach (var word in words) {
            postings += _postings[word].Count;
        }

        var key = CanopySearchFolding.ShardKey(prefix);
        if (postings <= limit || prefix.Length >= MaxPrefixLength) {
            shards[key] = words;
            return;
        }

        var longer = new List<string>(words.Count);
        foreach (var word in words) {
            if (word.Length == prefix.Length) {
                shards[key + "-"] = new List<string> { word };
            } else {
                longer.Add(word);
            }
        }

        foreach (var group in GroupByPrefix(longer, prefix.Length + 1)) {
            Split(group.Key, group.Value, limit, shards);
        }
    }

    /// <summary>Groups ordinally sorted words of at least <paramref name="length"/> code units by their first ones.</summary>
    private static List<KeyValuePair<string, List<string>>> GroupByPrefix(List<string> words, int length) {
        var groups = new List<KeyValuePair<string, List<string>>>();
        List<string>? current = null;
        string? prefix = null;
        foreach (var word in words) {
            if (prefix == null || string.CompareOrdinal(word, 0, prefix, 0, length) != 0) {
                prefix = word.Substring(0, length);
                current = new List<string>();
                groups.Add(new KeyValuePair<string, List<string>>(prefix, current));
            }

            current!.Add(word);
        }

        return groups;
    }
}
