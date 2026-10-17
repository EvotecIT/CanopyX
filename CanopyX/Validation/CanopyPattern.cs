using System;
using System.Text.RegularExpressions;

namespace CanopyX;

/// <summary>The shared bounded pattern grammar for browser editing and formatting. Arbitrary backtracking expressions
/// cannot run safely on the browser UI thread; authoring rejects them before a document is written.</summary>
internal static partial class CanopyPattern {
    internal static void Validate(string source, bool whole = false) {
        const string message = "Patterns require literals, character classes and at most one variable repetition anchored at the start; groups, alternatives and backreferences are unsupported.";
        if (source.Length > 256) throw new InvalidOperationException(message);
        var width = 0;
        var variable = 0;
        for (var i = 0; i < source.Length;) {
            var unit = source[i++];
            if (unit == '^' && i == 1 || unit == '$' && i == source.Length) continue;
            if (unit == '\\') {
                if (i == source.Length || @"dDsSwWbBnrtfv\.^$*+?{}[]()|/".IndexOf(source[i++]) < 0) throw new InvalidOperationException(message);
            } else if (unit == '[') {
                var closed = false;
                while (i < source.Length) {
                    var value = source[i++];
                    if (value == '\\') {
                        if (i == source.Length || @"dDsSwWbnrtfv\.^$*+?{}[]()|/-".IndexOf(source[i++]) < 0) throw new InvalidOperationException(message);
                    }
                    else if (value == ']') { closed = true; break; }
                }
                if (!closed) throw new InvalidOperationException(message);
            } else if ("()|^$*+?{}]".IndexOf(unit) >= 0) throw new InvalidOperationException(message);
            var count = 1;
            if (i < source.Length && "*+?".IndexOf(source[i]) >= 0) { variable++; i++; }
            else if (i < source.Length && source[i] == '{') {
                var match = Regex.Match(source.Substring(i), @"^\{(\d+)(?:,(\d*))?\}", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
                if (!match.Success || !int.TryParse(match.Groups[1].Value, out var low)) throw new InvalidOperationException(message);
                int? high = low;
                if (match.Groups[2].Success) {
                    if (match.Groups[2].Value.Length == 0) high = null;
                    else if (int.TryParse(match.Groups[2].Value, out var parsed)) high = parsed;
                    else throw new InvalidOperationException(message);
                }
                if (low > 256 || high.HasValue && (high.Value < low || high.Value > 256)) throw new InvalidOperationException(message);
                if (low != high) variable++;
                count = low == high ? low : 1;
                i += match.Length;
            }
            width += count;
            if (width > 256 || variable > 1) throw new InvalidOperationException(message);
        }
        if (variable > 0 && !whole && !source.StartsWith("^", StringComparison.Ordinal)) throw new InvalidOperationException(message);
    }
}
