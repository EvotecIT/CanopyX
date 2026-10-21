using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace CanopyX;

/// <summary>
/// The line and word comparison the diff view uses, the same in C# and in the browser's changes part (shared fixtures in
/// tests/fixtures/diff-cases.json): a common prefix and suffix are set aside, the middle is compared with Myers' algorithm, and
/// within each change the removed lines come before the added ones. A middle that needs more than <see cref="MaxEdits"/> edits is
/// one replacement, so the cost stays bounded for unrelated texts.
/// </summary>
internal static class CanopyTextDiffAlgorithm {
    /// <summary>The most line edits the comparison looks for before it treats the middle as one replacement.</summary>
    internal const int MaxEdits = 2000;

    /// <summary>The most token edits a word comparison looks for before it marks no words.</summary>
    internal const int MaxWordEdits = 200;

    /// <summary>The most tokens a line may have for a word comparison.</summary>
    internal const int MaxWordTokens = 1000;

    private static readonly Regex Tokens = new Regex(@"[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]", RegexOptions.CultureInvariant);

    /// <summary>The edit script of two line lists: '=' with both indexes, '-' with the before index, '+' with the after index.</summary>
    internal static List<(char Op, int Before, int After)> Lines(IReadOnlyList<string> before, IReadOnlyList<string> after) =>
        Script(before, after, MaxEdits, string.Equals) ?? Replace(before.Count, after.Count, 0, 0);

    /// <summary>Splits a text into lines at CRLF, LF or CR; a final line break ends the last line rather than starting an empty one.</summary>
    internal static List<string> SplitLines(string text) {
        var lines = new List<string>();
        var start = 0;
        for (var i = 0; i < text.Length; i++) {
            if (text[i] != '\r' && text[i] != '\n') continue;
            lines.Add(text.Substring(start, i - start));
            if (text[i] == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
            start = i + 1;
        }

        if (start < text.Length) lines.Add(text.Substring(start));
        return lines;
    }

    /// <summary>Compares two texts into hunks with <paramref name="context"/> unchanged lines around each change.</summary>
    internal static List<CanopyDiffHunk> Hunks(string before, string after, int context) {
        var left = SplitLines(before);
        var right = SplitLines(after);
        return Group(Lines(left, right), left, right, context);
    }

    /// <summary>Groups an edit script into hunks: changes closer than twice the context share one.</summary>
    internal static List<CanopyDiffHunk> Group(List<(char Op, int Before, int After)> script, IReadOnlyList<string> before, IReadOnlyList<string> after, int context) {
        var hunks = new List<CanopyDiffHunk>();
        var changes = new List<int>();
        for (var i = 0; i < script.Count; i++) if (script[i].Op != '=') changes.Add(i);
        var at = 0;
        while (at < changes.Count) {
            var first = changes[at];
            var last = first;
            while (at + 1 < changes.Count && changes[at + 1] - last - 1 <= 2 * context) last = changes[++at];
            at++;
            var from = Math.Max(0, first - context);
            var to = Math.Min(script.Count - 1, last + context);
            // A hunk starts at the first line it holds on each side; a side without lines names the line after the insertion point.
            int beforeStart = 1, afterStart = 1;
            for (var i = 0; i < from; i++) { if (script[i].Op != '+') beforeStart++; if (script[i].Op != '-') afterStart++; }
            var hunk = new CanopyDiffHunk(beforeStart, afterStart);
            for (var i = from; i <= to; i++) {
                var (op, b, a) = script[i];
                hunk.Lines.Add(op == '=' ? new CanopyDiffLine(CanopyDiffLineKind.Context, before[b]) : op == '-' ? new CanopyDiffLine(CanopyDiffLineKind.Removed, before[b]) :
                    new CanopyDiffLine(CanopyDiffLineKind.Added, after[a]));
            }

            hunks.Add(hunk);
        }

        return hunks;
    }

    /// <summary>
    /// The character ranges that differ between a removed line and the added line that replaces it, as [start, end) pairs on each
    /// side; null when the lines share too little for word marks to help (the whole line is the change) or are too long to compare.
    /// </summary>
    internal static (List<(int Start, int End)> Before, List<(int Start, int End)> After)? Words(string before, string after) {
        var left = TokensOf(before);
        var right = TokensOf(after);
        if (left.Count > MaxWordTokens || right.Count > MaxWordTokens) return null;
        var script = Script(left, right, MaxWordEdits, string.Equals);
        if (script == null) return null;
        var removed = new List<(int, int)>();
        var added = new List<(int, int)>();
        int same = 0, beforeAt = 0, afterAt = 0;
        foreach (var (op, b, a) in script) {
            if (op == '=') { same += left[b].Length; beforeAt += left[b].Length; afterAt += right[a].Length; continue; }
            if (op == '-') { Extend(removed, beforeAt, beforeAt + left[b].Length); beforeAt += left[b].Length; }
            else { Extend(added, afterAt, afterAt + right[a].Length); afterAt += right[a].Length; }
        }

        // Lines that share little are a rewrite: marking their few equal words would only scatter colour.
        var longest = Math.Max(before.Length, after.Length);
        if (longest == 0 || same * 100 < longest * 35) return null;
        return (removed, added);
    }

    private static void Extend(List<(int Start, int End)> ranges, int start, int end) {
        if (ranges.Count > 0 && ranges[ranges.Count - 1].End == start) ranges[ranges.Count - 1] = (ranges[ranges.Count - 1].Start, end);
        else ranges.Add((start, end));
    }

    private static List<string> TokensOf(string text) {
        var tokens = new List<string>();
        foreach (Match match in Tokens.Matches(text)) tokens.Add(match.Value);
        return tokens;
    }

    private static List<(char Op, int Before, int After)> Replace(int beforeCount, int afterCount, int beforeFrom, int afterFrom) {
        var script = new List<(char, int, int)>(beforeCount + afterCount);
        for (var i = 0; i < beforeCount; i++) script.Add(('-', beforeFrom + i, -1));
        for (var j = 0; j < afterCount; j++) script.Add(('+', -1, afterFrom + j));
        return script;
    }

    /// <summary>
    /// The edit script of two sequences, or null when the middle (after the common prefix and suffix) needs more than
    /// <paramref name="maxEdits"/> edits. Removed items come before added ones within each change.
    /// </summary>
    private static List<(char Op, int Before, int After)>? Script(IReadOnlyList<string> a, IReadOnlyList<string> b, int maxEdits, Func<string, string, bool> equal) {
        int n = a.Count, m = b.Count, prefix = 0, suffix = 0;
        while (prefix < n && prefix < m && equal(a[prefix], b[prefix])) prefix++;
        while (suffix < n - prefix && suffix < m - prefix && equal(a[n - 1 - suffix], b[m - 1 - suffix])) suffix++;
        var script = new List<(char Op, int Before, int After)>(n + m);
        for (var i = 0; i < prefix; i++) script.Add(('=', i, i));
        int bigN = n - prefix - suffix, bigM = m - prefix - suffix;
        if (bigN == 0 || bigM == 0) {
            script.AddRange(Replace(bigN, bigM, prefix, prefix));
        } else {
            var middle = Myers(a, b, prefix, bigN, bigM, maxEdits, equal);
            if (middle == null) {
                if (maxEdits < MaxEdits) return null;
                script.AddRange(Replace(bigN, bigM, prefix, prefix));
            } else {
                script.AddRange(middle);
            }
        }

        for (var i = 0; i < suffix; i++) script.Add(('=', n - suffix + i, m - suffix + i));
        return Ordered(script);
    }

    /// <summary>Myers' greedy comparison of a[offset..offset+bigN) with b[offset..offset+bigM), or null past the edit limit.</summary>
    private static List<(char Op, int Before, int After)>? Myers(IReadOnlyList<string> a, IReadOnlyList<string> b, int offset, int bigN, int bigM, int maxEdits, Func<string, string, bool> equal) {
        var limit = Math.Min(bigN + bigM, maxEdits);
        var v = new int[2 * limit + 3];
        var zero = limit + 1;
        var trace = new List<int[]>();
        var found = -1;
        for (var d = 0; d <= limit && found < 0; d++) {
            // The snapshot holds the furthest x of each diagonal from -(d-1) to d-1 after d-1 edits.
            var snapshot = new int[Math.Max(0, 2 * d - 1)];
            if (d > 0) Array.Copy(v, zero - (d - 1), snapshot, 0, snapshot.Length);
            trace.Add(snapshot);
            for (var k = -d; k <= d; k += 2) {
                var x = k == -d || k != d && v[zero + k - 1] < v[zero + k + 1] ? v[zero + k + 1] : v[zero + k - 1] + 1;
                var y = x - k;
                while (x < bigN && y < bigM && equal(a[offset + x], b[offset + y])) { x++; y++; }
                v[zero + k] = x;
                if (x >= bigN && y >= bigM) { found = d; break; }
            }
        }

        if (found < 0) return null;
        var reversed = new List<(char, int, int)>();
        int px = bigN, py = bigM;
        for (var d = found; d > 0; d--) {
            var previous = trace[d];
            int Get(int key) => previous[key + d - 1];
            var k = px - py;
            var prevK = k == -d || k != d && Get(k - 1) < Get(k + 1) ? k + 1 : k - 1;
            var prevX = Get(prevK);
            var prevY = prevX - prevK;
            while (px > prevX && py > prevY) { reversed.Add(('=', offset + px - 1, offset + py - 1)); px--; py--; }
            if (px == prevX) reversed.Add(('+', -1, offset + py - 1)); else reversed.Add(('-', offset + px - 1, -1));
            px = prevX; py = prevY;
        }

        while (px > 0 && py > 0) { reversed.Add(('=', offset + px - 1, offset + py - 1)); px--; py--; }
        reversed.Reverse();
        return reversed;
    }

    /// <summary>Within each run of changes, the removed items first, then the added ones, each in their order.</summary>
    private static List<(char Op, int Before, int After)> Ordered(List<(char Op, int Before, int After)> script) {
        var result = new List<(char, int, int)>(script.Count);
        var added = new List<(char, int, int)>();
        foreach (var entry in script) {
            if (entry.Op == '=') { result.AddRange(added); added.Clear(); result.Add(entry); }
            else if (entry.Op == '-') result.Add(entry);
            else added.Add(entry);
        }

        result.AddRange(added);
        return result;
    }
}
