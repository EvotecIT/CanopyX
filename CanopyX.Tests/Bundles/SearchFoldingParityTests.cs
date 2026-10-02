using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Bundles;
using Xunit;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// The bundle writer files a word under the form the browser runtime folds a query to, so both must fold every UTF-16
/// code unit the same way on every target framework. tests/fixtures/search-folding.json holds the folding as data; the
/// browser suite checks the runtime against the same file.
/// </summary>
/// <remarks>
/// This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472), where the platform's own
/// casing data differs, so it uses only the public bundle writer and APIs that both frameworks have.
/// </remarks>
public sealed class SearchFoldingParityTests {
    private const int WordsPerLabel = 2000;

    [Fact]
    public void Write_EveryCodeUnit_FoldsLikeTheSharedTable() {
        var expected = LoadTable();
        var view = new CanopyView("fold", "Folding") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        // Each word is a five-digit code unit number followed by that code unit, so the folded word says which code
        // unit it came from. Lone surrogates cannot be written as UTF-8, and ASCII separators split words.
        var probed = new List<int>();
        var label = new StringBuilder();
        for (var unit = 0; unit <= 0xFFFF; unit++) {
            if ((unit >= 0xD800 && unit <= 0xDFFF) || (unit < 128 && !IsAsciiLetterOrDigit(unit))) {
                continue;
            }

            probed.Add(unit);
            label.Append(unit.ToString("00000", CultureInfo.InvariantCulture)).Append((char)unit).Append(' ');
            if (probed.Count % WordsPerLabel == 0) {
                AddNode(view, label);
            }
        }

        AddNode(view, label);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-fold-" + Guid.NewGuid().ToString("N"));
        try {
            // Shard files of their own, so the words can be read straight from the s/ folder.
            var result = new CanopyBundleWriter(new CanopyBundleOptions { SearchPackBytes = 0 }).Write(view, directory);
            var folded = new Dictionary<int, string>();
            foreach (var file in Directory.EnumerateFiles(Path.Combine(result.DataDirectory, "s"), "*.js")) {
                // Label tokens start with U+0000; every other word starts with its code unit number.
                foreach (var word in ShardWords(File.ReadAllText(file, Encoding.UTF8)).Where(word => word[0] != '\0')) {
                    folded[int.Parse(word.Substring(0, 5), CultureInfo.InvariantCulture)] = word.Substring(5);
                }
            }

            Assert.Equal(probed.Count, folded.Count);
            var mismatches = probed
                .Where(unit => folded[unit] != ((char)(expected.TryGetValue(unit, out var small) ? small : unit)).ToString())
                .Select(unit => "U+" + unit.ToString("X4", CultureInfo.InvariantCulture))
                .ToList();
            Assert.True(mismatches.Count == 0, "Code units folded differently from tests/fixtures/search-folding.json: " + string.Join(", ", mismatches.Take(20)));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static void AddNode(CanopyView view, StringBuilder label) {
        if (label.Length > 0) {
            view.Roots.Add(new CanopyNode("n" + view.Roots.Count.ToString(CultureInfo.InvariantCulture), label.ToString()));
            label.Clear();
        }
    }

    private static bool IsAsciiLetterOrDigit(int unit) =>
        (unit >= '0' && unit <= '9') || (unit >= 'A' && unit <= 'Z') || (unit >= 'a' && unit <= 'z');

    private static Dictionary<int, int> LoadTable() {
        var text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "search-folding.json"));
        var table = new Dictionary<int, int>();
        foreach (Match pair in Regex.Matches(text, @"\[(\d+), (\d+)\]")) {
            table.Add(int.Parse(pair.Groups[1].Value, CultureInfo.InvariantCulture), int.Parse(pair.Groups[2].Value, CultureInfo.InvariantCulture));
        }

        Assert.True(table.Count > 1000, "The folding table did not load.");
        return table;
    }

    /// <summary>Reads the "words" array of a searchShard file without a JSON library, which net472 does not have.</summary>
    private static IEnumerable<string> ShardWords(string file) {
        var match = Regex.Match(file, "\"words\":\\[(.*?)\\],\"postings\"", RegexOptions.Singleline);
        Assert.True(match.Success, "A search shard has no words array.");
        var text = match.Groups[1].Value;
        var word = new StringBuilder();
        for (var i = 0; i < text.Length; i++) {
            if (text[i] != '"') {
                continue;
            }

            word.Clear();
            for (i++; text[i] != '"'; i++) {
                if (text[i] != '\\') {
                    word.Append(text[i]);
                } else if (text[++i] == 'u') {
                    word.Append((char)int.Parse(text.Substring(i + 1, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                    i += 4;
                } else {
                    word.Append(text[i]);
                }
            }

            yield return word.ToString();
        }
    }
}
