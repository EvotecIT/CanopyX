using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Bundles;

/// <summary>
/// Splits and folds label text for the search index exactly as the browser runtime does (see "Search" in
/// docs/data-protocol.md), so a word the bundle writer files under a shard is the word the runtime looks up.
/// </summary>
/// <remarks>
/// Common ranges use direct rules. Remaining single-unit lowercase pairs come from the frozen table shared with
/// the assembled browser runtime, rather than the host's Unicode casing version.
/// </remarks>
internal static class CanopySearchFolding {
    internal static char Fold(char unit) {
        int c = unit;
        if (c < 0x80) {
            return c >= 'A' && c <= 'Z' ? (char)(c + 32) : unit;
        }

        if (c >= 0xC0 && c <= 0xDE && c != 0xD7) {
            return (char)(c + 0x20);
        }

        if (c >= 0x0100 && c <= 0x017F) {
            return (char)FoldLatinExtendedA(c);
        }

        if ((c >= 0x0391 && c <= 0x03A9 && c != 0x03A2) || (c >= 0x0410 && c <= 0x042F)) {
            return (char)(c + 0x20);
        }

        if (c >= 0x0400 && c <= 0x040F) {
            return (char)(c + 0x50);
        }

        if (c >= 0x0531 && c <= 0x0556) {
            return (char)(c + 0x30);
        }

        switch (c) {
            case 0x0386: return (char)0x03AC;
            case 0x0388: return (char)0x03AD;
            case 0x0389: return (char)0x03AE;
            case 0x038A: return (char)0x03AF;
            case 0x038C: return (char)0x03CC;
            case 0x038E: return (char)0x03CD;
            case 0x038F: return (char)0x03CE;
            default: return CanopySearchFoldingTable.Fold(unit);
        }
    }

    /// <summary>Latin Extended-A pairs capitals and small letters, with the parity switching at U+0139 and U+0179.</summary>
    private static int FoldLatinExtendedA(int c) {
        if ((c <= 0x012F || (c >= 0x0132 && c <= 0x0137) || (c >= 0x014A && c <= 0x0177)) && c % 2 == 0) {
            return c + 1;
        }

        if (((c >= 0x0139 && c <= 0x0148) || (c >= 0x0179 && c <= 0x017E)) && c % 2 == 1) {
            return c + 1;
        }

        return c == 0x0178 ? 0x00FF : c;
    }

    internal static bool IsSeparator(char unit) =>
        unit < 128 && !((unit >= '0' && unit <= '9') || (unit >= 'A' && unit <= 'Z') || (unit >= 'a' && unit <= 'z'));

    /// <summary>Returns the distinct folded words of a label, in order of first appearance.</summary>
    internal static List<string> Words(string text) {
        var words = new List<string>();
        var seen = new HashSet<string>(System.StringComparer.Ordinal);
        var current = new StringBuilder();
        foreach (var unit in text ?? string.Empty) {
            if (IsSeparator(unit)) {
                Flush();
            } else {
                current.Append(Fold(unit));
            }
        }

        Flush();
        return words;

        void Flush() {
            if (current.Length > 0) {
                var word = current.ToString();
                if (seen.Add(word)) {
                    words.Add(word);
                }

                current.Clear();
            }
        }
    }

    /// <summary>Encodes a folded prefix as a shard key: a-z and 0-9 stay, other code units become _ plus four hex digits.</summary>
    internal static string ShardKey(string prefix) {
        var key = new StringBuilder(prefix.Length);
        foreach (var unit in prefix) {
            if ((unit >= 'a' && unit <= 'z') || (unit >= '0' && unit <= '9')) {
                key.Append(unit);
            } else {
                key.Append('_').Append(((int)unit).ToString("x4", CultureInfo.InvariantCulture));
            }
        }

        return key.ToString();
    }
}
