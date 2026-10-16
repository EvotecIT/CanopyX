using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX;

internal static partial class CanopyPattern {
    // Regex /iu uses Unicode simple folding, which differs from full text lowercase (for example final sigma).
    // A frozen Unicode 17 map also avoids the older casing tables in the legacy CLR. No input cache is retained.
    /// <summary>Canonical representatives of Unicode simple-case equivalence classes, preserving scalar length.</summary>
    internal static string FoldNativeInput(string value) {
        StringBuilder? result = null;
        for (var index = 0; index < value.Length;) {
            var point = ScalarAt(value, index, out var width);
            var mapped = point >= 'a' && point <= 'z' ? point - 32 : point < 128 || point > 0x1e943 ? point : MapPoint(FoldTable.Values, point);
            if (mapped != point && result == null) { result = new StringBuilder(value.Length); result.Append(value, 0, index); }
            if (result != null) AppendScalar(result, mapped);
            index += width;
        }
        return result?.ToString() ?? value;
    }

    private static bool NeedsCaseMapping(List<(int Low, int High)> ranges) {
        // A whole UTF-16 plane or the whole scalar range is closed under length-preserving casing.
        if (ranges.Count == 1 && ranges[0].Low <= 1 && (ranges[0].High == 0xffff || ranges[0].High == 0x10ffff)) return false;
        var digits = new List<(int Low, int High)> { ('0', '9') };
        var word = MergeRanges(new List<(int Low, int High)> { ('A', 'Z'), ('a', 'z'), ('0', '9'), ('_', '_') });
        var spaces = MergeRanges(Space.Select(value => ((int)value, (int)value)));
        return !ranges.SequenceEqual(Complement(digits)) && !ranges.SequenceEqual(Complement(word)) && !ranges.SequenceEqual(Complement(spaces));
    }

    /// <summary>Intersects merged author ranges with the fixed map. Work is bounded by the map size rather than
    /// the number of Unicode scalars in a class; ordinary ASCII patterns do not initialize the non-ASCII table.</summary>
    private static List<(int From, int To)> CaseMappings(List<(int Low, int High)> ranges) {
        var result = new List<(int From, int To)>();
        if (ranges.Count == 0) return result;
        foreach (var range in ranges) for (var point = Math.Max('a', range.Low); point <= Math.Min('z', range.High); point++) result.Add((point, point - 32));
        if (ranges[ranges.Count - 1].High < 128) return result;
        var values = FoldTable.Values; var cursor = 0;
        for (var index = 0; index < values.Length; index += 2) {
            var point = values[index];
            while (cursor < ranges.Count && ranges[cursor].High < point) cursor++;
            if (cursor == ranges.Count) break;
            if (ranges[cursor].Low <= point) result.Add((point, values[index + 1]));
        }
        return result;
    }

    private static int MapPoint(int[] pairs, int point) {
        var low = 0; var high = pairs.Length / 2 - 1;
        while (low <= high) {
            var middle = low + (high - low) / 2; var key = pairs[middle * 2];
            if (key == point) return pairs[middle * 2 + 1];
            if (key < point) low = middle + 1; else high = middle - 1;
        }
        return point;
    }

    private static bool InRanges(int[] ranges, int point) {
        var low = 0; var high = ranges.Length / 2 - 1;
        while (low <= high) {
            var middle = low + (high - low) / 2;
            if (point < ranges[middle * 2]) high = middle - 1;
            else if (point > ranges[middle * 2 + 1]) low = middle + 1;
            else return true;
        }
        return false;
    }

    private static int ScalarAt(string value, int index, out int width) {
        var unit = value[index]; width = char.IsHighSurrogate(unit) && index + 1 < value.Length && char.IsLowSurrogate(value[index + 1]) ? 2 : 1;
        return width == 2 ? char.ConvertToUtf32(unit, value[index + 1]) : unit;
    }

    private static void AppendScalar(StringBuilder result, int point) {
        if (point <= 0xffff) result.Append((char)point);
        else { result.Append((char)(0xd800 + ((point - 0x10000) >> 10))); result.Append((char)(0xdc00 + ((point - 0x10000) & 1023))); }
    }

    private static int[] DecodeCaseData(string source) {
        var bytes = Convert.FromBase64String(source); var result = new int[bytes.Length / 4];
        for (var index = 0; index < result.Length; index++) {
            var start = index * 4;
            result[index] = bytes[start] | bytes[start + 1] << 8 | bytes[start + 2] << 16 | bytes[start + 3] << 24;
        }
        return result;
    }

    // Nested static initialization allocates each immutable table only when its semantics are needed.
    private static class FoldTable {
        static FoldTable() { }
        internal static readonly int[] Values = DecodeCaseData(PackedFold);
    }
    private static class LowerTable {
        static LowerTable() { }
        internal static readonly int[] Values = DecodeCaseData(PackedLower);
    }
    private static class ContextTables {
        static ContextTables() { }
        internal static readonly int[] Cased = DecodeCaseData(PackedCased);
        internal static readonly int[] Ignorable = DecodeCaseData(PackedIgnorable);
        internal static readonly int[] Combining = DecodeCaseData(PackedCombining);
        internal static readonly int[] Above = DecodeCaseData(PackedAbove);
    }
}
