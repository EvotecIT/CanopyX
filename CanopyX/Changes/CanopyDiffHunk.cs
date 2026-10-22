using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A run of changed lines with unchanged lines around them, as a unified diff's <c>@@ -12,7 +12,8 @@</c> section: where it starts on
/// each side and its lines in order.
/// </summary>
public sealed class CanopyDiffHunk {
    /// <summary>Creates a hunk.</summary>
    /// <param name="beforeStart">The one-based number of the hunk's first line in the earlier text; when the hunk has no lines there, the number of the line after the insertion point (1 for an empty text).</param>
    /// <param name="afterStart">The same for the later text.</param>
    public CanopyDiffHunk(int beforeStart, int afterStart) {
        BeforeStart = beforeStart;
        AfterStart = afterStart;
    }

    /// <summary>Gets the one-based number of the hunk's first line in the earlier text.</summary>
    public int BeforeStart { get; }

    /// <summary>Gets the one-based number of the hunk's first line in the later text.</summary>
    public int AfterStart { get; }

    /// <summary>Gets the lines in order: unchanged, removed and added.</summary>
    public IList<CanopyDiffLine> Lines { get; } = new List<CanopyDiffLine>();

    /// <summary>Gets how many lines of the earlier text the hunk covers: its unchanged and removed lines.</summary>
    public int BeforeCount {
        get {
            var count = 0;
            foreach (var line in Lines) if (line.Kind != CanopyDiffLineKind.Added) count++;
            return count;
        }
    }

    /// <summary>Gets how many lines of the later text the hunk covers: its unchanged and added lines.</summary>
    public int AfterCount {
        get {
            var count = 0;
            foreach (var line in Lines) if (line.Kind != CanopyDiffLineKind.Removed) count++;
            return count;
        }
    }

    /// <summary>Adds a line and returns the hunk, for chaining.</summary>
    /// <param name="kind">Unchanged, removed or added.</param>
    /// <param name="text">The text without its line break.</param>
    /// <returns>The hunk.</returns>
    public CanopyDiffHunk Line(CanopyDiffLineKind kind, string text) {
        Lines.Add(new CanopyDiffLine(kind, text));
        return this;
    }
}