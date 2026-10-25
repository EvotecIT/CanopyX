using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyGridPresenter {
    /// <summary>Gets whether a true boolean denotes a problem.</summary>
    public bool Inverted { get; private set; }
    /// <summary>Gets whether identifier or expanded text uses the monospace font.</summary>
    public bool Mono { get; private set; }
    /// <summary>Gets the numeric column supplying a change delta.</summary>
    public string? DeltaColumn { get; private set; }
    /// <summary>Gets whether an increasing change is good.</summary>
    public bool HigherIsGood { get; private set; }
    /// <summary>Gets the column supplying optional identifier secondary text.</summary>
    public string? SecondaryColumn { get; private set; }
    /// <summary>Gets the optional shared history minimum. Null scales each cell independently.</summary>
    public double? Minimum { get; private set; }
    /// <summary>Gets the optional shared history maximum.</summary>
    public double? ScaleMaximum { get; private set; }
    /// <summary>Gets whether a sparkline marks its last point instead of its worst point.</summary>
    public bool MarkLast { get; private set; }
    /// <summary>Gets exact raw text values mapped to semantic tones.</summary>
    public IReadOnlyDictionary<string, CanopyTone> Tones { get; private set; } = new ReadOnlyDictionary<string, CanopyTone>(new Dictionary<string, CanopyTone>());
    /// <summary>Gets the tones an enum or state presenter shows as plain text instead of a chip or dot, muted unless <see cref="QuietStyle"/> is <see cref="CanopyGridQuietStyle.Plain"/>. Empty keeps every tone coloured.</summary>
    public IReadOnlyList<CanopyTone> QuietTones { get; private set; } = Array.Empty<CanopyTone>();

    /// <summary>Returns a copy of this enum or state presenter that shows the given tones as plain text (muted by default, see <see cref="WithQuietStyle"/>), for example
    /// <c>CanopyTone.Success</c> so healthy values read quietly while chips stay for values that need attention.</summary>
    /// <param name="tones">At most 16 named tones. Hosts map their values to tones with the tone mapping or cell tones.</param>
    /// <returns>A new immutable descriptor.</returns>
    /// <exception cref="InvalidOperationException">The presenter is not an enum or state presenter.</exception>
    /// <exception cref="ArgumentException">A tone is <see cref="CanopyTone.None"/> or more than 16 tones are given.</exception>
    public CanopyGridPresenter WithQuietTones(params CanopyTone[] tones) {
        if (Kind != CanopyGridPresenterKind.Enum && Kind != CanopyGridPresenterKind.State) throw new InvalidOperationException("Quiet tones apply to enum and state presenters.");
        if (tones == null || tones.Length > 16 || Array.Exists(tones, tone => tone.Name == null)) throw new ArgumentException("Quiet tones need 1 to 16 named tones.", nameof(tones));
        var copy = (CanopyGridPresenter)MemberwiseClone(); copy.QuietTones = Array.AsReadOnly((CanopyTone[])tones.Clone()); return copy;
    }
    /// <summary>Gets how the values of the quiet tones read: muted (the default) or in the normal text colour.</summary>
    public CanopyGridQuietStyle QuietStyle { get; private set; }

    /// <summary>Returns a copy of this enum or state presenter whose quiet values use the given style, for example
    /// <see cref="CanopyGridQuietStyle.Plain"/> so values without a tone read as ordinary text rather than disabled. In an enum
    /// column quiet values keep the inline start of the chips beside them.</summary>
    /// <param name="style">The style of quiet values.</param>
    /// <returns>A new immutable descriptor.</returns>
    /// <exception cref="InvalidOperationException">The presenter is not an enum or state presenter.</exception>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="style"/> is unknown.</exception>
    public CanopyGridPresenter WithQuietStyle(CanopyGridQuietStyle style) {
        if (Kind != CanopyGridPresenterKind.Enum && Kind != CanopyGridPresenterKind.State) throw new InvalidOperationException("Quiet styles apply to enum and state presenters.");
        if (style != CanopyGridQuietStyle.Muted && style != CanopyGridQuietStyle.Plain) throw new ArgumentOutOfRangeException(nameof(style), style, "Unknown quiet style.");
        var copy = (CanopyGridPresenter)MemberwiseClone(); copy.QuietStyle = style; return copy;
    }    /// <summary>Gets ordered inclusive upper bounds for progress and history tones.</summary>
    public IReadOnlyList<CanopyGridThreshold> Thresholds { get; private set; } = Array.Empty<CanopyGridThreshold>();

    /// <summary>Creates tone pills; success values render as quiet states.</summary>
    /// <param name="tones">Optional exact raw-value tone mapping, copied into the descriptor.</param>
    public static CanopyGridPresenter Enum(IDictionary<string, CanopyTone>? tones = null) => WithTones(CanopyGridPresenterKind.Enum, tones);
    /// <summary>Creates state dots with quiet healthy text.</summary>
    /// <param name="tones">Optional exact raw-value tone mapping, copied into the descriptor.</param>
    public static CanopyGridPresenter State(IDictionary<string, CanopyTone>? tones = null) => WithTones(CanopyGridPresenterKind.State, tones);
    /// <summary>Creates a numeric change presenter.</summary>
    /// <param name="deltaColumn">Declared numeric column supplying the delta.</param>
    /// <param name="higherIsGood">Whether an increasing delta is good; decreasing is good by default.</param>
    public static CanopyGridPresenter Change(string deltaColumn, bool higherIsGood = false) {
        CanopyIdentifiers.Require(deltaColumn, nameof(deltaColumn));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Change) { DeltaColumn = deltaColumn, HigherIsGood = higherIsGood };
    }
    /// <summary>Creates a period-state history that preserves ranges when condensed.</summary>
    public static CanopyGridPresenter StatusStrip() => new CanopyGridPresenter(CanopyGridPresenterKind.StatusStrip);
    /// <summary>Creates a bar history. A shared scale requires both bounds.</summary>
    /// <param name="thresholds">Ascending inclusive upper-bound tones.</param>
    /// <param name="minimum">Optional shared minimum.</param>
    /// <param name="maximum">Optional shared maximum.</param>
    /// <param name="higherIsGood">Whether larger values are healthier when choosing the worst point.</param>
    /// <param name="markLast">Whether to mark the last point instead of the worst.</param>
    public static CanopyGridPresenter SparklineBars(IEnumerable<CanopyGridThreshold>? thresholds = null, double? minimum = null,
        double? maximum = null, bool higherIsGood = false, bool markLast = false) => History(CanopyGridPresenterKind.SparklineBars, thresholds, minimum, maximum, higherIsGood, markLast);
    /// <summary>Creates a line history. A shared scale requires both bounds.</summary>
    /// <param name="thresholds">Ascending inclusive upper-bound tones.</param>
    /// <param name="minimum">Optional shared minimum.</param>
    /// <param name="maximum">Optional shared maximum.</param>
    /// <param name="higherIsGood">Whether larger values are healthier when choosing the worst point.</param>
    /// <param name="markLast">Whether to mark the last point instead of the worst.</param>
    public static CanopyGridPresenter SparklineLine(IEnumerable<CanopyGridThreshold>? thresholds = null, double? minimum = null,
        double? maximum = null, bool higherIsGood = false, bool markLast = false) => History(CanopyGridPresenterKind.SparklineLine, thresholds, minimum, maximum, higherIsGood, markLast);
    /// <summary>Creates primary and optional secondary identifier text.</summary>
    /// <param name="secondaryColumn">Optional declared column supplying secondary text; otherwise uses cell metadata.</param>
    /// <param name="mono">Whether the primary text is monospace.</param>
    public static CanopyGridPresenter Identifier(string? secondaryColumn = null, bool mono = false) {
        if (secondaryColumn != null) CanopyIdentifiers.Require(secondaryColumn, nameof(secondaryColumn));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Identifier) { SecondaryColumn = secondaryColumn, Mono = mono };
    }
    /// <summary>Creates at most three outlined tags with a complete-text control.</summary>
    /// <param name="separator">Nonempty literal separator, at most sixteen code units.</param>
    public static CanopyGridPresenter Tags(string separator = ",") {
        var list = List(separator); return new CanopyGridPresenter(CanopyGridPresenterKind.Tags, separator: list.Separator, limit: 3);
    }
    /// <summary>Creates normal text with a muted em dash for missing values.</summary>
    public static CanopyGridPresenter Missing() => new CanopyGridPresenter(CanopyGridPresenterKind.Missing);
    /// <summary>Creates a complete-text dialog with optional monospace text.</summary>
    /// <param name="mono">Whether expanded text uses the monospace font.</param>
    public static CanopyGridPresenter LongText(bool mono) => new CanopyGridPresenter(CanopyGridPresenterKind.LongText) { Mono = mono };
    /// <summary>Creates a progress indicator with threshold tones.</summary>
    /// <param name="maximum">Finite positive progress maximum.</param>
    /// <param name="thresholds">Ascending inclusive upper-bound tones.</param>
    public static CanopyGridPresenter Progress(double maximum, IEnumerable<CanopyGridThreshold> thresholds) {
        var presenter = Progress(maximum); presenter.Thresholds = CopyThresholds(thresholds); return presenter;
    }
    private static CanopyGridPresenter WithTones(CanopyGridPresenterKind kind, IDictionary<string, CanopyTone>? tones) {
        var copy = new Dictionary<string, CanopyTone>(StringComparer.Ordinal);
        if (tones != null) foreach (var pair in tones) {
            if (pair.Key.Length > 4096 || copy.Count >= 512) throw new ArgumentException("Tone mappings support at most 512 bounded text values.", nameof(tones));
            copy.Add(pair.Key, pair.Value);
        }
        return new CanopyGridPresenter(kind) { Tones = new ReadOnlyDictionary<string, CanopyTone>(copy) };
    }
    private static IReadOnlyList<CanopyGridThreshold> CopyThresholds(IEnumerable<CanopyGridThreshold>? thresholds) {
        var result = new List<CanopyGridThreshold>();
        if (thresholds != null) foreach (var threshold in thresholds) {
            if (threshold == null || result.Count >= 32 || result.Count > 0 && result[result.Count - 1].UpperBound >= threshold.UpperBound)
                throw new ArgumentException("Thresholds need at most 32 strictly ascending bounds.", nameof(thresholds));
            result.Add(threshold);
        }
        return result.AsReadOnly();
    }
    private static CanopyGridPresenter History(CanopyGridPresenterKind kind, IEnumerable<CanopyGridThreshold>? thresholds,
        double? minimum, double? maximum, bool higherIsGood, bool markLast) {
        if (minimum.HasValue != maximum.HasValue || minimum.HasValue && (!Safe(minimum.Value) || !Safe(maximum!.Value) || minimum >= maximum))
            throw new ArgumentException("A shared history scale needs two finite increasing bounds.");
        return new CanopyGridPresenter(kind) { Thresholds = CopyThresholds(thresholds), Minimum = minimum, ScaleMaximum = maximum, HigherIsGood = higherIsGood, MarkLast = markLast };
    }
    internal static bool Safe(double value) => !double.IsNaN(value) && !double.IsInfinity(value) && Math.Abs(value) <= 9007199254740991d;
    internal void Validate(CanopyColumn column, IList<CanopyColumn> columns) {
        if ((Kind == CanopyGridPresenterKind.Progress || Kind == CanopyGridPresenterKind.Change && !BeforeAfterValues) && column.Kind != CanopyColumnKind.Number)
            throw new InvalidOperationException("Progress and change presenters require numeric raw values.");
        if ((Kind == CanopyGridPresenterKind.Boolean || Kind == CanopyGridPresenterKind.List || Kind == CanopyGridPresenterKind.Tags || Kind == CanopyGridPresenterKind.Link) && column.Kind != CanopyColumnKind.Text)
            throw new InvalidOperationException("This presenter requires text or boolean raw values.");
        foreach (var id in new[] { HrefColumn, DeltaColumn, SecondaryColumn }) if (id != null) {
            CanopyColumn? target = null; foreach (var candidate in columns) if (candidate.Id == id) target = candidate;
            if (target == null || id == DeltaColumn && target.Kind != CanopyColumnKind.Number || id == HrefColumn && target.Kind != CanopyColumnKind.Text)
                throw new InvalidOperationException("A presenter reference requires a declared column of the appropriate raw kind.");
        }
    }
    private void WriteDesignJson(CanopyJsonWriter writer) {
        if (BeforeAfterValues) writer.Property("beforeAfter", true);
        if (Inverted) writer.Property("inverted", true);
        if (Mono) writer.Property("mono", true);
        if (HigherIsGood) writer.Property("higherIsGood", true);
        if (MarkLast) writer.Property("mark", "last");
        writer.OptionalProperty("deltaColumn", DeltaColumn).OptionalProperty("secondaryColumn", SecondaryColumn);
        if (Minimum.HasValue) writer.Name("minimum").Number(Minimum.Value).Name("scaleMaximum").Number(ScaleMaximum!.Value);
        if (Tones.Count > 0) { writer.Name("tones").BeginObject(); foreach (var pair in Tones) writer.Property(pair.Key, pair.Value.Name ?? "neutral"); writer.EndObject(); }
        if (QuietTones.Count > 0) { writer.Name("quietTones").BeginArray(); foreach (var tone in QuietTones) writer.String(tone.Name); writer.EndArray(); }
        if (QuietStyle == CanopyGridQuietStyle.Plain) writer.Property("quietStyle", "plain");
        if (Thresholds.Count > 0) { writer.Name("thresholds").BeginArray(); foreach (var threshold in Thresholds) threshold.WriteJson(writer); writer.EndArray(); }
    }
}
