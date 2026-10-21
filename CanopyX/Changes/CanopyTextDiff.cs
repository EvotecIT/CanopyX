using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX;

/// <summary>
/// A text diff of one file: the lines that changed, inline or side by side, with line numbers, word marks inside changed lines,
/// unchanged regions folded away and a copy-ready unified diff (docs/changes.md). The browser's changes part draws it with a
/// window of mounted rows, so long diffs stay fast.
/// </summary>
/// <remarks>
/// <para>
/// Give the lines as <see cref="Hunks"/> the host computed (preferred; <see cref="AddLines"/> builds them from numbered lines,
/// <see cref="Compare"/> computes them from the texts), or give <see cref="BeforeText"/> and <see cref="AfterText"/> alone and the
/// browser compares texts of up to <see cref="ClientCompareLines"/> lines itself. With both texts, folded regions can be opened.
/// A file that has no lines to compare is <see cref="CanopyDiffContent.Binary"/>, <see cref="CanopyDiffContent.Unavailable"/>
/// (with a <see cref="Message"/> that says why) or <see cref="CanopyDiffContent.Identical"/>.
/// </para>
/// <para>The document is checked when it is written (<see cref="Validate"/>, <see cref="ToJson"/> and the writers); <see cref="FromJson"/> reads one back.</para>
/// </remarks>
public sealed partial class CanopyTextDiff {
    /// <summary>The most lines the hunks of one diff hold.</summary>
    public const int MaxLines = 200000;

    /// <summary>The most characters of one line.</summary>
    public const int MaxLineLength = 20000;

    /// <summary>The most characters of each text.</summary>
    public const int MaxTextLength = 2000000;

    /// <summary>The most lines per text the browser compares itself when a diff carries texts without hunks.</summary>
    public const int ClientCompareLines = 5000;

    /// <summary>Creates a diff.</summary>
    /// <param name="id">The diff's identity; a nonempty identifier of at most 256 characters.</param>
    /// <param name="label">Its accessible name, such as the file name: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    public CanopyTextDiff(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the diff's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the accessible name, such as the file name.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets the file's path, shown above the lines and in the unified diff's headers; at most 2,048 characters.</summary>
    public string? Path { get; set; }

    /// <summary>Gets or sets the file's earlier path when it was renamed or moved; at most 2,048 characters.</summary>
    public string? PreviousPath { get; set; }

    /// <summary>Gets or sets what the diff can show: text, or a state without lines.</summary>
    public CanopyDiffContent Content { get; set; }

    /// <summary>Gets or sets why there are no lines to show, or anything else the reader should know first; at most 1,000 characters.</summary>
    public string? Message { get; set; }

    /// <summary>Gets or sets the title of the earlier side, such as "DC01, 10:40"; "Before" (the label) when null.</summary>
    public string? BeforeTitle { get; set; }

    /// <summary>Gets or sets the title of the later side, such as "DC02, 10:46"; "After" (the label) when null.</summary>
    public string? AfterTitle { get; set; }

    /// <summary>Gets or sets the whole earlier text, which lets the reader open folded regions and the browser compare when there are no hunks.</summary>
    public string? BeforeText { get; set; }

    /// <summary>Gets or sets the whole later text.</summary>
    public string? AfterText { get; set; }

    /// <summary>Gets the hunks in order; empty when the browser compares the texts.</summary>
    public IList<CanopyDiffHunk> Hunks { get; } = new List<CanopyDiffHunk>();

    /// <summary>Gets or sets how many unchanged lines show around each change, 0 to 20; longer unchanged runs fold. Default 3.</summary>
    public int Context { get; set; } = 3;

    /// <summary>Gets or sets how the diff opens: side by side on wide screens and inline on narrow ones by default.</summary>
    public CanopyDiffLayout Layout { get; set; }

    /// <summary>Gets notes about the change that the lines cannot show, at most 16, such as changed line endings.</summary>
    public IList<CanopyChangeNote> Notes { get; } = new List<CanopyChangeNote>();

    /// <summary>Gets or sets whether the host left some changes out, for example past a size limit; the diff then says so.</summary>
    public bool Truncated { get; set; }

    /// <summary>Gets or sets the host's copy-ready unified diff; when null, Copy writes one from the hunks.</summary>
    public string? UnifiedDiff { get; set; }

    /// <summary>Gets or sets the translations of the texts the diff writes itself; the document carries those that differ from English.</summary>
    public CanopyLabels? Labels { get; set; }

    /// <summary>Creates a diff of two texts whose hunks the browser computes, or C# when <paramref name="compare"/> is true.</summary>
    /// <param name="id">The diff's identity.</param>
    /// <param name="label">Its accessible name.</param>
    /// <param name="before">The earlier text.</param>
    /// <param name="after">The later text.</param>
    /// <param name="compare">Whether to compute the hunks now (<see cref="Compare"/>).</param>
    /// <returns>The diff.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="before"/> or <paramref name="after"/> is null.</exception>
    public static CanopyTextDiff FromTexts(string id, string label, string before, string after, bool compare = false) {
        var diff = new CanopyTextDiff(id, label) {
            BeforeText = before ?? throw new ArgumentNullException(nameof(before)),
            AfterText = after ?? throw new ArgumentNullException(nameof(after))
        };
        return compare ? diff.Compare() : diff;
    }

    /// <summary>
    /// Computes the hunks from <see cref="BeforeText"/> and <see cref="AfterText"/> with <see cref="Context"/> unchanged lines around
    /// each change, replacing any hunks, and returns the diff. The comparison is the browser's (a Myers comparison of the lines between
    /// the common start and end; a middle that needs more than 2,000 edits becomes one replacement).
    /// </summary>
    /// <returns>The diff.</returns>
    /// <exception cref="InvalidOperationException">A text is missing.</exception>
    public CanopyTextDiff Compare() {
        if (BeforeText == null || AfterText == null) throw new InvalidOperationException("Compare needs both texts.");
        Hunks.Clear();
        foreach (var hunk in CanopyTextDiffAlgorithm.Hunks(BeforeText, AfterText, Context)) Hunks.Add(hunk);
        Number();
        return this;
    }

    /// <summary>
    /// Adds hunks from numbered lines, as a host's own comparison lists them: unchanged and removed lines carry their number in the
    /// earlier text, unchanged and added lines in the later text. A gap in the numbers starts a new hunk. Returns the diff.
    /// </summary>
    /// <param name="lines">The lines in order.</param>
    /// <returns>The diff.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="lines"/> is null.</exception>
    /// <exception cref="ArgumentException">A line lacks a number its kind needs, or the numbers go backwards.</exception>
    public CanopyTextDiff AddLines(IEnumerable<CanopyDiffLine> lines) {
        if (lines == null) throw new ArgumentNullException(nameof(lines));
        var current = new List<CanopyDiffLine>();
        int? expectBefore = null, expectAfter = null;
        // The numbers that follow the previous hunk: the unchanged run between two hunks is as long on both sides.
        int lastBefore = 1, lastAfter = 1;
        foreach (var hunk in Hunks) { lastBefore = hunk.BeforeStart + hunk.BeforeCount; lastAfter = hunk.AfterStart + hunk.AfterCount; }
        void Close() {
            if (current.Count == 0) return;
            int? firstBefore = null, firstAfter = null;
            foreach (var line in current) { firstBefore ??= line.BeforeNumber; firstAfter ??= line.AfterNumber; }
            var hunk = new CanopyDiffHunk(firstBefore ?? lastBefore + ((firstAfter ?? lastAfter) - lastAfter), firstAfter ?? lastAfter + ((firstBefore ?? lastBefore) - lastBefore));
            foreach (var line in current) hunk.Lines.Add(line);
            Hunks.Add(hunk);
            lastBefore = hunk.BeforeStart + hunk.BeforeCount;
            lastAfter = hunk.AfterStart + hunk.AfterCount;
            current.Clear();
            expectBefore = expectAfter = null;
        }

        foreach (var line in lines) {
            if (line == null) throw new ArgumentException("Lines cannot be null.", nameof(lines));
            var before = line.Kind != CanopyDiffLineKind.Added ? line.BeforeNumber ?? throw new ArgumentException("Unchanged and removed lines need their number in the earlier text.", nameof(lines)) : (int?)null;
            var after = line.Kind != CanopyDiffLineKind.Removed ? line.AfterNumber ?? throw new ArgumentException("Unchanged and added lines need their number in the later text.", nameof(lines)) : (int?)null;
            var continues = current.Count > 0 && (before == null || expectBefore == null || before == expectBefore) && (after == null || expectAfter == null || after == expectAfter);
            if (!continues) {
                Close();
                if (before < lastBefore || after < lastAfter || before < 1 || after < 1) throw new ArgumentException("Line numbers start at 1 and must not go backwards.", nameof(lines));
            }

            current.Add(new CanopyDiffLine(line.Kind, line.Text, before, after));
            if (before != null) expectBefore = before + 1;
            if (after != null) expectAfter = after + 1;
        }

        Close();
        return this;
    }

    /// <summary>
    /// Writes the unified diff (<c>--- a/…</c>, <c>+++ b/…</c> and <c>@@ -12,7 +12,8 @@</c> sections) of the hunks, or of the texts
    /// compared now when there are no hunks; the host's <see cref="UnifiedDiff"/> when it gave one. Empty when there are no lines.
    /// </summary>
    /// <returns>The unified diff, with LF line breaks.</returns>
    public string ToUnifiedDiff() {
        if (UnifiedDiff != null) return UnifiedDiff;
        var hunks = Hunks.Count > 0 || BeforeText == null || AfterText == null ? (IList<CanopyDiffHunk>)Hunks : CanopyTextDiffAlgorithm.Hunks(BeforeText, AfterText, Context);
        if (hunks.Count == 0) return string.Empty;
        var text = new StringBuilder();
        text.Append("--- a/").Append(PreviousPath ?? Path ?? Label).Append('\n').Append("+++ b/").Append(Path ?? Label).Append('\n');
        foreach (var hunk in hunks) {
            int before = hunk.BeforeCount, after = hunk.AfterCount;
            text.Append("@@ -").Append(Range(hunk.BeforeStart, before)).Append(" +").Append(Range(hunk.AfterStart, after)).Append(" @@\n");
            foreach (var line in hunk.Lines) text.Append(line.Kind == CanopyDiffLineKind.Added ? '+' : line.Kind == CanopyDiffLineKind.Removed ? '-' : ' ').Append(line.Text).Append('\n');
        }

        return text.ToString();
    }

    /// <summary>A unified diff range: the start and count, with the start before an empty range as GNU diff writes it.</summary>
    private static string Range(int start, int count) =>
        (count == 0 ? start - 1 : start).ToString(CultureInfo.InvariantCulture) + (count == 1 ? string.Empty : "," + count.ToString(CultureInfo.InvariantCulture));

    /// <summary>Gives every line of the hunks its numbers.</summary>
    internal void Number() {
        foreach (var hunk in Hunks) {
            int before = hunk.BeforeStart, after = hunk.AfterStart;
            foreach (var line in hunk.Lines) {
                line.BeforeNumber = line.Kind != CanopyDiffLineKind.Added ? before++ : (int?)null;
                line.AfterNumber = line.Kind != CanopyDiffLineKind.Removed ? after++ : (int?)null;
            }
        }
    }

    /// <summary>Checks the diff as the writers do.</summary>
    /// <exception cref="InvalidOperationException">The diff is not valid; the message names the first problem.</exception>
    public void Validate() => CanopyChangeValidator.Validate(this);
}
