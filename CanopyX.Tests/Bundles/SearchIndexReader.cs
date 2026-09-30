using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace CanopyX.Tests.Bundles;

/// <summary>One node as a search entry file describes it.</summary>
internal sealed record SearchEntry(IReadOnlyList<string> Path, string Label, string? Kind);

/// <summary>
/// Reads a bundle's search index the way "Search Index" in docs/data-protocol.md tells a reader to, written out
/// independently of the bundle writer and of the browser runtime.
/// </summary>
internal sealed class SearchIndexReader {
    private readonly SidecarFiles _files;
    private readonly List<int> _starts;
    private readonly List<string> _kinds;
    private readonly Dictionary<string, int> _shards;
    private readonly Dictionary<int, EntryFile> _entryFiles = new();
    private readonly Dictionary<string, JsonNode> _shardFiles = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<int>> _found = new(StringComparer.Ordinal);
    private readonly List<int>? _entryPacks;
    private readonly List<string>? _shardPacks;

    internal SearchIndexReader(SidecarFiles files) {
        _files = files;
        var search = files.Document("manifest")["search"]!;
        EntryCount = search["entryCount"]!.GetValue<int>();
        _starts = search["entryFiles"]!.AsArray().Select(first => first!.GetValue<int>()).ToList();
        _kinds = search["kinds"]!.AsArray().Select(kind => kind!.GetValue<string>()).ToList();
        _shards = search["shards"]!.AsObject().ToDictionary(shard => shard.Key, shard => shard.Value!.GetValue<int>(), StringComparer.Ordinal);
        _entryPacks = search["entryPacks"]?.AsArray().Select(first => first!.GetValue<int>()).ToList();
        _shardPacks = search["shardPacks"]?.AsArray().Select(first => first!.GetValue<string>()).ToList();
        Assert.Equal(_entryPacks == null, _shardPacks == null);
    }

    /// <summary>Gets whether the index files are packed, and the first entry file and shard key of every pack.</summary>
    internal IReadOnlyList<int>? EntryPacks => _entryPacks;

    internal IReadOnlyList<string>? ShardPacks => _shardPacks;

    /// <summary>
    /// Reads an entry file or a shard: a file of its own, or, in a packed index, the page of an index pack that the
    /// manifest's first names lead to. Entry packs come first, then shard packs, each shard pack holding consecutive
    /// keys in ordinal order.
    /// </summary>
    internal JsonNode IndexDocument(bool entries, string name) {
        if (_entryPacks == null) {
            return _files.Document(entries ? "e/" + name : "s/k-" + name);
        }

        int pack, slot;
        if (entries) {
            var file = int.Parse(name, CultureInfo.InvariantCulture);
            pack = _entryPacks.FindLastIndex(first => first <= file);
            slot = file - _entryPacks[pack];
        } else {
            var keys = _shards.Keys.OrderBy(key => key, StringComparer.Ordinal).ToList();
            var at = _shardPacks!.FindLastIndex(first => string.CompareOrdinal(first, name) <= 0);
            pack = _entryPacks.Count + at;
            slot = keys.IndexOf(name) - keys.IndexOf(_shardPacks[at]);
        }

        var pages = _files.Document("q/" + pack.ToString(CultureInfo.InvariantCulture))["pages"]!.AsArray();
        Assert.InRange(slot, 0, pages.Count - 1);
        return JsonNode.Parse(pages[slot]!.GetValue<string>())!;
    }

    internal int EntryCount { get; }

    /// <summary>Gets the first entry number of each entry file.</summary>
    internal IReadOnlyList<int> EntryFiles => _starts;

    /// <summary>Gets every shard file key with the posting count the manifest states for it.</summary>
    internal IReadOnlyDictionary<string, int> Shards => _shards;

    /// <summary>Rebuilds one entry from the single entry file that holds it: its own entries plus its stem.</summary>
    internal SearchEntry Entry(int number) {
        var file = _starts.FindLastIndex(first => first <= number);
        if (!_entryFiles.TryGetValue(file, out var entries)) {
            var count = (file + 1 < _starts.Count ? _starts[file + 1] : EntryCount) - _starts[file];
            entries = new EntryFile(IndexDocument(true, file.ToString(CultureInfo.InvariantCulture)), _starts[file], count);
            _entryFiles.Add(file, entries);
        }

        var (path, label, kind) = entries.Resolve(number);
        return new SearchEntry(path, label, kind is int index ? _kinds[index] : null);
    }

    /// <summary>The ascending numbers of the entries that have a word starting with a folded query word.</summary>
    internal List<int> Find(string word) {
        if (_found.TryGetValue(word, out var known)) {
            return known;
        }

        var numbers = new SortedSet<int>();
        foreach (var key in ShardsFor(word)) {
            var shard = Shard(key);
            var words = shard["words"]!.AsArray();
            var postings = shard["postings"]!.AsArray();
            Assert.Equal(words.Count, postings.Count);
            for (var i = 0; i < words.Count; i++) {
                if (words[i]!.GetValue<string>().StartsWith(word, StringComparison.Ordinal)) {
                    numbers.UnionWith(Decode(postings[i]!.AsArray()));
                }
            }
        }

        return _found[word] = numbers.ToList();
    }

    /// <summary>Decodes one posting list: an entry number, then gaps, where -n stands for n entries without a gap.</summary>
    internal static List<int> Decode(JsonArray list) {
        var numbers = new List<int>();
        var value = 0;
        for (var i = 0; i < list.Count; i++) {
            var step = list[i]!.GetValue<int>();
            if (i == 0) {
                Assert.True(step >= 0, "A posting list must start with an entry number.");
                numbers.Add(value = step);
            } else if (step > 0) {
                numbers.Add(value += step);
            } else {
                Assert.True(step < 0, "A posting list cannot hold a zero gap.");
                for (var n = 0; n < -step; n++) {
                    numbers.Add(++value);
                }
            }
        }

        return numbers;
    }

    internal JsonNode Shard(string key) {
        if (!_shardFiles.TryGetValue(key, out var shard)) {
            shard = IndexDocument(false, key);
            Assert.Equal(key, shard["key"]!.GetValue<string>());
            _shardFiles.Add(key, shard);
        }

        return shard;
    }

    /// <summary>The shard files a reader loads for one folded query word: the resolved shards, each with its parts in order.</summary>
    internal List<string> ShardsFor(string word) {
        var keys = _shards.Keys.ToList();
        var bases = keys.Where(key => !IsPart(key)).ToList();
        IEnumerable<string> selected = Array.Empty<string>();
        // A prefix has at least two code units; a one-unit word selects the shards of every prefix it starts.
        for (var length = Math.Min(2, word.Length); length <= word.Length; length++) {
            var key = Key(word.Substring(0, length));
            if (_shards.ContainsKey(key)) {
                selected = new[] { key };
                break;
            }

            var deeper = bases.Where(k => k.Length > key.Length && k.StartsWith(key, StringComparison.Ordinal)).ToList();
            if (deeper.Count == 0) {
                break;
            }

            if (length == word.Length) {
                selected = deeper;
            }
        }

        return selected.SelectMany(key => new[] { key }.Concat(keys.Where(k => k.StartsWith(key + ".", StringComparison.Ordinal))
            .OrderBy(k => int.Parse(k.Substring(k.LastIndexOf('.') + 1), CultureInfo.InvariantCulture)))).ToList();
    }

    internal static bool IsPart(string key) {
        var dot = key.LastIndexOf('.');
        return dot >= 0 && key.Substring(dot + 1).All(char.IsAsciiDigit);
    }

    /// <summary>The shard key of a folded prefix: a-z and 0-9 stay, other code units become _ plus four hex digits.</summary>
    internal static string Key(string prefix) {
        var key = new StringBuilder();
        foreach (var unit in prefix) {
            key.Append((unit >= 'a' && unit <= 'z') || (unit >= '0' && unit <= '9') ? unit.ToString() : "_" + ((int)unit).ToString("x4", CultureInfo.InvariantCulture));
        }

        return key.ToString();
    }

    /// <summary>The distinct folded words of a label, from the rules in docs/data-protocol.md.</summary>
    internal static IEnumerable<string> Words(string label) {
        var folded = new StringBuilder();
        foreach (var unit in label) {
            folded.Append(unit < 128 && !char.IsAsciiLetterOrDigit(unit) ? ' ' : (char)FoldBySpec(unit));
        }

        return folded.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries).Distinct();
    }

    /// <summary>
    /// The label token: U+0000 and eight hex digits of the 32-bit FNV-1a hash of the folded label's code units,
    /// without the ASCII separators at its start and end.
    /// </summary>
    internal static string LabelToken(string label) {
        static bool Separator(char unit) => unit < 128 && !char.IsAsciiLetterOrDigit(unit);
        var trimmed = label.AsSpan();
        while (trimmed.Length > 0 && Separator(trimmed[0])) trimmed = trimmed.Slice(1);
        while (trimmed.Length > 0 && Separator(trimmed[trimmed.Length - 1])) trimmed = trimmed.Slice(0, trimmed.Length - 1);
        var hash = 2166136261u;
        foreach (var unit in trimmed) {
            hash = unchecked((hash ^ (uint)FoldBySpec(unit)) * 16777619u);
        }

        return "\0" + hash.ToString("x8", CultureInfo.InvariantCulture);
    }

    /// <summary>Folding for the ranges the test trees use: ASCII, Latin-1, Latin Extended-A, Greek, and Cyrillic.</summary>
    internal static int FoldBySpec(int c) {
        var accented = new Dictionary<int, int> { [0x0386] = 0x03AC, [0x0388] = 0x03AD, [0x0389] = 0x03AE, [0x038A] = 0x03AF, [0x038C] = 0x03CC, [0x038E] = 0x03CD, [0x038F] = 0x03CE };
        var evenCapitals = (c >= 0x0100 && c <= 0x0137 && c != 0x0130 && c != 0x0131) || (c >= 0x014A && c <= 0x0177);
        var oddCapitals = (c >= 0x0139 && c <= 0x0148) || (c >= 0x0179 && c <= 0x017E);
        return c >= 'A' && c <= 'Z' ? c + 32
            : c >= 0xC0 && c <= 0xDE && c != 0xD7 ? c + 32
            : evenCapitals && c % 2 == 0 || oddCapitals && c % 2 == 1 ? c + 1
            : c == 0x0178 ? 0x00FF
            : (c >= 0x0391 && c <= 0x03A9 && c != 0x03A2) || (c >= 0x0410 && c <= 0x042F) ? c + 32
            : c >= 0x0400 && c <= 0x040F ? c + 0x50
            : accented.TryGetValue(c, out var small) ? small : c;
    }

    /// <summary>One searchEntries document: the entries it holds and the stem of ancestors they need.</summary>
    private sealed class EntryFile {
        private readonly Dictionary<int, JsonArray> _items = new();
        private readonly Dictionary<int, string> _ids = new();

        internal EntryFile(JsonNode document, int first, int count) {
            Assert.Equal("searchEntries", document["type"]!.GetValue<string>());
            Assert.Equal(first, document["first"]!.GetValue<int>());
            var entries = document["entries"]!.AsArray();
            Assert.Equal(count, entries.Count);
            for (var i = 0; i < entries.Count; i++) {
                _items.Add(first + i, entries[i]!.AsArray());
            }

            foreach (var ancestor in document["stem"]!.AsArray()) {
                var fields = ancestor!.AsArray();
                _items.Add(fields[0]!.GetValue<int>(), new JsonArray(fields.Skip(1).Select(field => field!.DeepClone()).ToArray()));
            }
        }

        internal (List<string> Path, string Label, int? Kind) Resolve(int number) {
            var path = new List<string>();
            for (var current = number; current >= 0; current = Parent(current)) {
                path.Add(Id(current));
            }

            path.Reverse();
            var item = _items[number];
            return (path, item[4]!.GetValue<string>(), item.Count > 5 ? item[5]!.GetValue<int>() : null);
        }

        private int Parent(int number) {
            Assert.True(_items.ContainsKey(number), "Entry " + number + " is neither in the file nor in its stem.");
            var parent = _items[number][0]!.GetValue<int>();
            Assert.True(parent < number, "Entry " + number + " does not come after its parent.");
            return parent;
        }

        private string Id(int number) {
            if (_ids.TryGetValue(number, out var id)) {
                return id;
            }

            // Ancestors first, without recursion, so a deep chain does not grow the call stack.
            var chain = new List<int>();
            for (var current = number; current >= 0 && !_ids.ContainsKey(current); current = Parent(current)) {
                chain.Add(current);
            }

            for (var i = chain.Count - 1; i >= 0; i--) {
                var item = _items[chain[i]];
                var parent = item[0]!.GetValue<int>();
                var parentId = parent < 0 ? string.Empty : _ids[parent];
                var head = item[1]!.GetValue<int>();
                var tail = item[3]!.GetValue<int>();
                Assert.True(head + tail <= parentId.Length, "Entry " + chain[i] + " shares more than its parent id holds.");
                _ids[chain[i]] = parentId.Substring(0, head) + item[2]!.GetValue<string>() + parentId.Substring(parentId.Length - tail);
            }

            return _ids[number];
        }
    }
}
