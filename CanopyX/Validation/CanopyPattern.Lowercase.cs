using System;
using System.Text;

namespace CanopyX;

internal static partial class CanopyPattern {
    /// <summary>Unicode full lowercase used by JavaScript text and wildcards. The only conditional lowercase
    /// rules are final sigma and the Unicode SpecialCasing rules for Turkish, Azeri and Lithuanian.</summary>
    internal static string LowerNativeInput(string value, string? culture = null) {
        var turkic = Language(culture, "tr") || Language(culture, "az"); var lithuanian = Language(culture, "lt");
        StringBuilder? result = null;
        for (var index = 0; index < value.Length;) {
            var point = ScalarAt(value, index, out var width); string? expansion = null;
            var mapped = point >= 'A' && point <= 'Z' ? point + 32 : point < 128 || point > 0x1e921 ? point : MapPoint(LowerTable.Values, point);
            if (point == 0x03a3 && FinalSigma(value, index, width)) mapped = 0x03c2;
            if (point == 0x0130) { mapped = 'i'; if (!turkic) expansion = "i\u0307"; }
            if (turkic) {
                if (point == 'I' && !BeforeDot(value, index + width)) mapped = 0x0131;
                if (point == 0x0307 && AfterI(value, index)) expansion = string.Empty;
            } else if (lithuanian) {
                if ((point == 'I' || point == 'J' || point == 0x012e) && MoreAbove(value, index + width)) expansion = (point == 'I' ? "i" : point == 'J' ? "j" : "\u012f") + "\u0307";
                else if (point == 0x00cc) expansion = "i\u0307\u0300";
                else if (point == 0x00cd) expansion = "i\u0307\u0301";
                else if (point == 0x0128) expansion = "i\u0307\u0303";
            }
            if ((mapped != point || expansion != null) && result == null) { result = new StringBuilder(value.Length); result.Append(value, 0, index); }
            if (result != null) { if (expansion != null) result.Append(expansion); else AppendScalar(result, mapped); }
            index += width;
        }
        return result?.ToString() ?? value;
    }

    private static bool Language(string? culture, string language) => culture != null &&
        culture.StartsWith(language, StringComparison.OrdinalIgnoreCase) && (culture.Length == 2 || culture[2] == '-');

    private static bool FinalSigma(string value, int index, int width) {
        var previous = index;
        while (previous > 0) {
            previous--; if (char.IsLowSurrogate(value[previous]) && previous > 0 && char.IsHighSurrogate(value[previous - 1])) previous--;
            var point = ScalarAt(value, previous, out _);
            if (InRanges(ContextTables.Ignorable, point)) continue;
            if (!InRanges(ContextTables.Cased, point)) return false;
            for (var next = index + width; next < value.Length;) {
                point = ScalarAt(value, next, out var length); next += length;
                if (!InRanges(ContextTables.Ignorable, point)) return !InRanges(ContextTables.Cased, point);
            }
            return true;
        }
        return false;
    }

    private static bool BeforeDot(string value, int index) {
        for (; index < value.Length;) {
            var point = ScalarAt(value, index, out var width); index += width;
            if (point == 0x0307) return true;
            if (!InRanges(ContextTables.Combining, point) || InRanges(ContextTables.Above, point)) return false;
        }
        return false;
    }

    private static bool AfterI(string value, int index) {
        while (index > 0) {
            index--; if (char.IsLowSurrogate(value[index]) && index > 0 && char.IsHighSurrogate(value[index - 1])) index--;
            var point = ScalarAt(value, index, out _);
            if (point == 'I') return true;
            if (!InRanges(ContextTables.Combining, point) || InRanges(ContextTables.Above, point)) return false;
        }
        return false;
    }

    private static bool MoreAbove(string value, int index) {
        for (; index < value.Length;) {
            var point = ScalarAt(value, index, out var width); index += width;
            if (InRanges(ContextTables.Above, point)) return true;
            if (!InRanges(ContextTables.Combining, point)) return false;
        }
        return false;
    }
}
