using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace CanopyX;

internal static partial class CanopyPattern {
    private const string Scalar = @"(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])";
    private const string Word = "[A-Za-z0-9_]";
    private const string Boundary = "(?:(?<!" + Word + ")(?=" + Word + ")|(?<=" + Word + ")(?!" + Word + "))";
    private const string Space = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

    /// <summary>Compiles only the shared bounded grammar. Native groups express Unicode scalar atoms;
    /// they are implementation details, not additional author syntax.</summary>
    internal static Regex CompileNative(string source, bool exact) {
        Validate(source);
        var atoms = new List<(List<(int Low, int High)>? Ranges, bool Negative, string? Fixed, string Repeat)>();
        for (var index = 0; index < source.Length;) {
            var unit = source[index++];
            List<(int Low, int High)>? ranges = null;
            var negative = false; string? fixedAtom = null;
            if (unit == '^') fixedAtom = @"\A";
            else if (unit == '$') fixedAtom = @"\z";
            else if (unit == '.') fixedAtom = "(?![\r\n\u2028\u2029])" + Scalar;
            else if (unit == '[') {
                negative = index < source.Length && source[index] == '^'; if (negative) index++;
                ranges = new List<(int, int)>();
                while (index < source.Length && source[index] != ']') {
                    var first = ReadClassUnit(source, ref index);
                    if (index + 1 < source.Length && source[index] == '-' && source[index + 1] != ']') {
                        index++; var last = ReadClassUnit(source, ref index);
                        if (first.Count != 1 || first[0].Low != first[0].High || last.Count != 1 || last[0].Low != last[0].High || first[0].Low > last[0].Low) throw new InvalidOperationException("Invalid pattern range.");
                        ranges.Add((first[0].Low, last[0].Low));
                    } else ranges.AddRange(first);
                }
                index++;
            } else if (unit == '\\' && (source[index] == 'b' || source[index] == 'B')) {
                fixedAtom = source[index++] == 'b' ? Boundary : "(?!" + Boundary + ")";
            } else {
                index--;
                ranges = ReadClassUnit(source, ref index);
            }
            var repeat = string.Empty;
            if (index < source.Length && "*+?".IndexOf(source[index]) >= 0) repeat = source[index++].ToString();
            else if (index < source.Length && source[index] == '{') {
                var end = source.IndexOf('}', index); repeat = source.Substring(index, end - index + 1); index = end + 1;
            }
            atoms.Add((ranges, negative, fixedAtom, repeat));
        }
        // Map the union once, rather than scanning the Unicode range separately for every class.
        var requested = MergeRanges(atoms.Where(atom => atom.Ranges != null && NeedsCaseMapping(MergeRanges(atom.Ranges))).SelectMany(atom => atom.Ranges!));
        var folding = exact ? new List<(int From, int To)>() : CaseMappings(requested);
        var expression = new StringBuilder();
        foreach (var atom in atoms) {
            var value = atom.Fixed;
            if (atom.Ranges != null) {
                var ranges = MergeRanges(atom.Ranges);
                var expanded = new List<(int, int)>(ranges);
                foreach (var mapping in folding) if (ranges.Any(range => mapping.From >= range.Low && mapping.From <= range.High)) expanded.Add((mapping.To, mapping.To));
                value = ScalarRanges(MergeRanges(expanded));
                if (atom.Negative) value = "(?!" + value + ")" + Scalar;
            }
            expression.Append("(?:").Append(value).Append(')').Append(atom.Repeat);
        }
        return new Regex(expression.ToString(), RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    }

    private static List<(int Low, int High)> ReadClassUnit(string source, ref int index) {
        var unit = source[index++];
        if (unit == '\\') {
            unit = source[index++];
            if ("dDsSwW".IndexOf(unit) >= 0) {
                var positive = char.ToLowerInvariant(unit);
                var ranges = positive == 'd' ? new List<(int, int)> { ('0', '9') } : positive == 'w'
                    ? new List<(int, int)> { ('A', 'Z'), ('a', 'z'), ('0', '9'), ('_', '_') }
                    : Space.Select(value => ((int)value, (int)value)).ToList();
                return char.IsUpper(unit) ? Complement(MergeRanges(ranges)) : ranges;
            }
            unit = unit == 'b' ? '\b' : unit == 'n' ? '\n' : unit == 'r' ? '\r' : unit == 't' ? '\t' : unit == 'f' ? '\f' : unit == 'v' ? '\v' : unit;
        }
        var scalar = char.IsHighSurrogate(unit) && index < source.Length && char.IsLowSurrogate(source[index])
            ? char.ConvertToUtf32(unit, source[index++]) : unit;
        return new List<(int, int)> { (scalar, scalar) };
    }

    private static List<(int Low, int High)> MergeRanges(IEnumerable<(int Low, int High)> values) {
        var result = new List<(int Low, int High)>();
        foreach (var range in values.OrderBy(value => value.Low).ThenBy(value => value.High)) {
            if (result.Count > 0 && result[result.Count - 1].High + 1 >= range.Low) {
                var last = result[result.Count - 1]; result[result.Count - 1] = (last.Low, Math.Max(last.High, range.High));
            } else result.Add(range);
        }
        return result;
    }

    private static List<(int Low, int High)> Complement(List<(int Low, int High)> ranges) {
        var result = new List<(int, int)>(); var next = 0;
        foreach (var range in ranges) { if (next < range.Low) result.Add((next, range.Low - 1)); next = range.High + 1; }
        if (next <= 0x10ffff) result.Add((next, 0x10ffff));
        return result;
    }

    private static string ScalarRanges(List<(int Low, int High)> ranges) {
        var alternatives = new List<string>();
        foreach (var range in ranges) {
            if (range.Low <= 0xffff) {
                var high = Math.Min(0xffff, range.High);
                if (range.Low < 0xd800) alternatives.Add(UnitRange(range.Low, Math.Min(0xd7ff, high)));
                if (high >= 0xe000) alternatives.Add(UnitRange(Math.Max(0xe000, range.Low), high));
                if (range.Low <= 0xdbff && high >= 0xd800) alternatives.Add(UnitRange(Math.Max(0xd800, range.Low), Math.Min(0xdbff, high)) + @"(?![\uDC00-\uDFFF])");
                if (range.Low <= 0xdfff && high >= 0xdc00) alternatives.Add(@"(?<![\uD800-\uDBFF])" + UnitRange(Math.Max(0xdc00, range.Low), Math.Min(0xdfff, high)));
            }
            if (range.High <= 0xffff) continue;
            var low = Math.Max(0x10000, range.Low) - 0x10000; var end = range.High - 0x10000;
            var first = 0xd800 + (low >> 10); var last = 0xd800 + (end >> 10);
            if (first == last) alternatives.Add(UnitRange(first, first) + UnitRange(0xdc00 + (low & 1023), 0xdc00 + (end & 1023)));
            else {
                alternatives.Add(UnitRange(first, first) + UnitRange(0xdc00 + (low & 1023), 0xdfff));
                if (first + 1 < last) alternatives.Add(UnitRange(first + 1, last - 1) + @"[\uDC00-\uDFFF]");
                alternatives.Add(UnitRange(last, last) + UnitRange(0xdc00, 0xdc00 + (end & 1023)));
            }
        }
        return alternatives.Count == 0 ? "(?!)" : "(?:" + string.Join("|", alternatives) + ")";
    }

    private static string UnitRange(int low, int high) => low == high ? "\\u" + low.ToString("X4", CultureInfo.InvariantCulture)
        : "[\\u" + low.ToString("X4", CultureInfo.InvariantCulture) + "-\\u" + high.ToString("X4", CultureInfo.InvariantCulture) + "]";
}
