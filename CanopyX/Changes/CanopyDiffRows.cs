using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// The rows a diff shows, as the browser builds them: its hunks (or the texts compared), unchanged runs longer than the context folded
/// into gaps, the unchanged lines before, between and (when the texts are known) after the hunks as gaps, and word marks for each
/// removed line and the added line that takes its place.
/// </summary>
internal static class CanopyDiffRows {
    /// <summary>A row: a line with its numbers and word marks, or a gap of unchanged lines.</summary>
    internal sealed class Row {
        internal CanopyDiffLineKind Kind;
        internal int? Before;
        internal int? After;
        internal string Text = string.Empty;
        internal List<(int Start, int End)>? Marks;
        internal int Gap;
    }

    internal static List<Row> Build(CanopyTextDiff diff) {
        var hunks = diff.Hunks.Count > 0 || diff.BeforeText == null || diff.AfterText == null ? (IList<CanopyDiffHunk>)diff.Hunks : CanopyTextDiffAlgorithm.Hunks(diff.BeforeText, diff.AfterText, diff.Context);
        var rows = new List<Row>();
        var nextBefore = 1;
        foreach (var hunk in hunks) {
            if (hunk.BeforeStart > nextBefore) rows.Add(new Row { Gap = hunk.BeforeStart - nextBefore });
            var lines = new List<Row>();
            int before = hunk.BeforeStart, after = hunk.AfterStart;
            foreach (var line in hunk.Lines) {
                lines.Add(new Row { Kind = line.Kind, Text = line.Text, Before = line.Kind != CanopyDiffLineKind.Added ? before++ : (int?)null, After = line.Kind != CanopyDiffLineKind.Removed ? after++ : (int?)null });
            }

            Mark(lines);
            Fold(lines, rows, diff.Context);
            nextBefore = before;
        }

        if (diff.BeforeText != null && hunks.Count > 0) {
            var rest = CanopyTextDiffAlgorithm.SplitLines(diff.BeforeText).Count - (nextBefore - 1);
            if (rest > 0) rows.Add(new Row { Gap = rest });
        }

        return rows;
    }

    /// <summary>Pairs each run of removed lines with the added lines after it, line by line, and marks the words that differ.</summary>
    private static void Mark(List<Row> lines) {
        for (var i = 0; i < lines.Count;) {
            if (lines[i].Kind == CanopyDiffLineKind.Context) { i++; continue; }
            var removed = i;
            while (i < lines.Count && lines[i].Kind == CanopyDiffLineKind.Removed) i++;
            var added = i;
            while (i < lines.Count && lines[i].Kind == CanopyDiffLineKind.Added) i++;
            for (var k = 0; k < Math.Min(added - removed, i - added); k++) {
                var words = CanopyTextDiffAlgorithm.Words(lines[removed + k].Text, lines[added + k].Text);
                if (words == null) continue;
                lines[removed + k].Marks = words.Value.Before;
                lines[added + k].Marks = words.Value.After;
            }
        }
    }

    /// <summary>Adds a hunk's rows, folding unchanged runs longer than the context: a leading run keeps its last lines, a trailing run its first, a run between changes both ends.</summary>
    private static void Fold(List<Row> lines, List<Row> rows, int context) {
        for (var i = 0; i < lines.Count;) {
            if (lines[i].Kind != CanopyDiffLineKind.Context) { rows.Add(lines[i++]); continue; }
            var start = i;
            while (i < lines.Count && lines[i].Kind == CanopyDiffLineKind.Context) i++;
            int length = i - start, keepStart = start == 0 ? 0 : context, keepEnd = i == lines.Count ? 0 : context;
            if (length <= keepStart + keepEnd + 1) { rows.AddRange(lines.GetRange(start, length)); continue; }
            rows.AddRange(lines.GetRange(start, keepStart));
            rows.Add(new Row { Gap = length - keepStart - keepEnd });
            rows.AddRange(lines.GetRange(i - keepEnd, keepEnd));
        }
    }
}
