using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyGridPresenter {
    /// <summary>Gets whether a state presenter sets its dot (or glyph) and text in a tone pill.</summary>
    public bool Pill { get; private set; }

    /// <summary>Gets the decorative glyphs a state presenter shows instead of its dot, by exact raw text value.</summary>
    public IReadOnlyDictionary<string, string> Icons { get; private set; } = new ReadOnlyDictionary<string, string>(new Dictionary<string, string>());

    /// <summary>Gets whether a bar history keeps one slot per period: a faint baseline for a period without a run and a taller
    /// bar for a run in the danger tone.</summary>
    public bool Slots { get; private set; }

    /// <summary>Gets how many log lines show before a Show all control.</summary>
    public int Lines { get; private set; } = 10;

    /// <summary>Gets whether the lines of a text log read as <c>time level message</c>.</summary>
    public bool SplitLines { get; private set; }

    /// <summary>
    /// Creates a relative time for a date column: "in 3 hr.", "27 sec. ago" or "yesterday" in the page language, kept current
    /// by one timer per grid. The exact time, in the grid's time zone, is its tooltip and part of its accessible name. Sorting,
    /// filters, search and exports keep the raw date; the static outline shows the exact time.
    /// </summary>
    /// <param name="secondaryColumn">Optional declared column supplying a secondary text (for example "At 02:00"); otherwise
    /// the cell's <see cref="CanopyCell.Secondary"/>. Rows with automatic heights show it under the time.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentException">The supplied column ID is empty.</exception>
    public static CanopyGridPresenter RelativeTime(string? secondaryColumn = null) {
        if (secondaryColumn != null) CanopyIdentifiers.Require(secondaryColumn, nameof(secondaryColumn));
        return new CanopyGridPresenter(CanopyGridPresenterKind.RelativeTime) { SecondaryColumn = secondaryColumn };
    }

    /// <summary>
    /// Creates a monospace log for a text column. Lines come from the cell's timeline (<see cref="CanopyCell.Events"/>: the
    /// event's time, its kind as the level and its summary as the message) or from the lines of the text value. Levels take
    /// their tone from <paramref name="levelTones"/>, else from the usual names (error, warning, info, debug), else the event's tone.
    /// Fixed-height rows preview the first line; automatic row heights and the record panel show the lines with copy and Show all.
    /// </summary>
    /// <param name="lines">How many lines show before Show all, from 1 to 500.</param>
    /// <param name="split">Whether each line of a text value reads as <c>time level message</c>; otherwise a line is the message.</param>
    /// <param name="levelTones">Optional exact level-to-tone mapping, copied into the descriptor.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The line count is outside 1 to 500.</exception>
    public static CanopyGridPresenter Log(int lines = 10, bool split = false, IDictionary<string, CanopyTone>? levelTones = null) {
        if (lines < 1 || lines > 500) throw new ArgumentOutOfRangeException(nameof(lines));
        var presenter = WithTones(CanopyGridPresenterKind.Log, levelTones);
        presenter.Lines = lines; presenter.SplitLines = split;
        return presenter;
    }

    /// <summary>Returns a copy of this state presenter that sets the dot and text in a tone pill ("● Active").</summary>
    /// <returns>A new immutable descriptor.</returns>
    /// <exception cref="InvalidOperationException">The presenter is not a state presenter.</exception>
    public CanopyGridPresenter WithPill() {
        if (Kind != CanopyGridPresenterKind.State) throw new InvalidOperationException("Pills apply to state presenters.");
        var copy = (CanopyGridPresenter)MemberwiseClone(); copy.Pill = true; return copy;
    }

    /// <summary>Returns a copy of this state presenter that shows a decorative glyph instead of the dot for the given raw values,
    /// for example a lock for "Read-only". The text still carries the meaning.</summary>
    /// <param name="icons">At most 512 raw values (each at most 4,096 characters) mapped to glyphs of 1 to 32 nonblank code units.</param>
    /// <returns>A new immutable descriptor.</returns>
    /// <exception cref="InvalidOperationException">The presenter is not a state presenter.</exception>
    /// <exception cref="ArgumentException">The mapping is missing, too large, or holds a blank or long glyph.</exception>
    public CanopyGridPresenter WithIcons(IDictionary<string, string> icons) {
        if (Kind != CanopyGridPresenterKind.State) throw new InvalidOperationException("Icons apply to state presenters.");
        if (icons == null || icons.Count > 512) throw new ArgumentException("Icons map at most 512 values.", nameof(icons));
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in icons) {
            if (pair.Key.Length > 4096 || string.IsNullOrWhiteSpace(pair.Value) || pair.Value.Length > 32) throw new ArgumentException("A glyph needs 1 to 32 nonblank code units.", nameof(icons));
            map.Add(pair.Key, pair.Value);
        }
        var copy = (CanopyGridPresenter)MemberwiseClone(); copy.Icons = new ReadOnlyDictionary<string, string>(map); return copy;
    }

    /// <summary>Returns a copy of this bar history that keeps one slot per recent period, for a run history: a period without a
    /// value or state draws a faint baseline, a danger run stands at least two thirds tall, and height follows the value.</summary>
    /// <returns>A new immutable descriptor.</returns>
    /// <exception cref="InvalidOperationException">The presenter is not a bar history.</exception>
    public CanopyGridPresenter WithSlots() {
        if (Kind != CanopyGridPresenterKind.SparklineBars) throw new InvalidOperationException("Slots apply to bar histories.");
        var copy = (CanopyGridPresenter)MemberwiseClone(); copy.Slots = true; return copy;
    }

    private void WriteActivityJson(CanopyJsonWriter writer) {
        if (Pill) writer.Property("style", "pill");
        if (Icons.Count > 0) { writer.Name("icons").BeginObject(); foreach (var pair in Icons) writer.Property(pair.Key, pair.Value); writer.EndObject(); }
        if (Slots) writer.Property("slots", true);
        if (Kind != CanopyGridPresenterKind.Log) return;
        if (Lines != 10) writer.Property("lines", Lines);
        if (SplitLines) writer.Property("split", true);
    }
}
