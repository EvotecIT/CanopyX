using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The content of one cell: a value used for sorting and default formatting, plus optional display text, tooltip,
/// tone, and badges supplied by the host.
/// </summary>
/// <remarks>
/// Values are limited to text, numbers, booleans, and dates so every cell can be written as JSON and sorted in the
/// browser. Implicit conversions let hosts assign plain values: <c>node.Cells["size"] = 1024;</c>.
/// A cell that has only a value is written as a bare JSON value; otherwise it is written as an object.
/// </remarks>
public sealed partial class CanopyCell {
    private readonly object? _value;
    private List<CanopyBadge>? _badges;
    private List<CanopyCellPeriod>? _series;
    private object? _sortKey;

    /// <summary>Creates an empty cell, useful for a cell that shows only badges or display text.</summary>
    public CanopyCell() {
    }

    /// <summary>Creates a text cell.</summary>
    /// <param name="value">The text value; <see langword="null"/> leaves the cell empty.</param>
    public CanopyCell(string? value) {
        _value = value;
    }

    /// <summary>Creates a numeric cell.</summary>
    /// <param name="value">The value.</param>
    public CanopyCell(long value) {
        _value = value;
    }

    /// <summary>Creates a numeric cell.</summary>
    /// <param name="value">The value. <see cref="double.NaN"/> and infinities are written as an empty value.</param>
    public CanopyCell(double value) {
        _value = value;
    }

    /// <summary>Creates a numeric cell.</summary>
    /// <param name="value">The value.</param>
    public CanopyCell(decimal value) {
        _value = value;
    }

    /// <summary>Creates a boolean cell.</summary>
    /// <param name="value">The value.</param>
    public CanopyCell(bool value) {
        _value = value;
    }

    /// <summary>Creates a date and time cell. The value is written as ISO 8601 UTC.</summary>
    /// <param name="value">The value. <see cref="DateTimeKind.Unspecified"/> values are treated as UTC.</param>
    public CanopyCell(DateTime value) {
        _value = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }

    /// <summary>Creates a date and time cell. The value is written as ISO 8601 UTC.</summary>
    /// <param name="value">The value.</param>
    public CanopyCell(DateTimeOffset value) {
        _value = value.UtcDateTime;
    }

    /// <summary>
    /// Gets the value: a <see cref="string"/>, <see cref="long"/>, <see cref="double"/>, <see cref="decimal"/>,
    /// <see cref="bool"/>, UTC <see cref="DateTime"/>, or <see langword="null"/>.
    /// </summary>
    public object? Value => _value;

    /// <summary>Gets or sets the text shown instead of the formatted value.</summary>
    public string? Text { get; set; }

    /// <summary>Gets or sets alternate search text for flat grids, independently of display, sorting and export values.</summary>
    /// <remarks>Null searches the raw value. Empty text deliberately excludes this cell's value from text search. Tree search indexes retain their existing contract.</remarks>
    public string? SearchText { get; set; }

    /// <summary>Gets or sets an optional tooltip.</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets optional secondary identifier text, independent of raw query values.</summary>
    public string? Secondary { get; set; }

    /// <summary>Gets up to 4096 ordered visual history periods for strip and sparkline presenters.</summary>
    public IList<CanopyCellPeriod> Series => _series ??= new List<CanopyCellPeriod>();

    /// <summary>Gets or sets the semantic colour of the cell text.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>
    /// Gets or sets the key this cell sorts by when it differs from its value, like DataTables' orthogonal sort data or an
    /// AG Grid comparator: text, a number, or a date (written as ISO 8601 UTC text with milliseconds, which sorts in time order). Sorting
    /// reads it; filters, value lists, search and the display keep reading <see cref="Value"/> and <see cref="Text"/>. Null
    /// sorts by the value. Give every cell of a column a key of one type. A host source sorts on its own and may ignore it.
    /// </summary>
    /// <exception cref="ArgumentException">The key is not text, a finite number or a date.</exception>
    public object? SortKey {
        get => _sortKey;
        set => _sortKey = value switch {
            double real when double.IsNaN(real) || double.IsInfinity(real) => throw new ArgumentException("A sort key number must be finite.", nameof(value)),
            null or string or long or double or decimal => value,
            int number => (long)number,
            // Dates are UTC, as cell values are: a local time is converted, an unspecified one is taken as UTC.
            DateTime date => date.Kind == DateTimeKind.Local ? date.ToUniversalTime() : DateTime.SpecifyKind(date, DateTimeKind.Utc),
            DateTimeOffset offset => offset.UtcDateTime,
            _ => throw new ArgumentException("A sort key is text, a number or a date.", nameof(value))
        };
    }

    /// <summary>Gets the badges shown after the cell text.</summary>
    public IList<CanopyBadge> Badges => _badges ??= new List<CanopyBadge>();

    /// <summary>Converts text to a cell.</summary>
    /// <param name="value">The text.</param>
    public static implicit operator CanopyCell(string? value) => new CanopyCell(value);

    /// <summary>Converts a number to a cell.</summary>
    /// <param name="value">The number.</param>
    public static implicit operator CanopyCell(int value) => new CanopyCell(value);

    /// <summary>Converts a number to a cell.</summary>
    /// <param name="value">The number.</param>
    public static implicit operator CanopyCell(long value) => new CanopyCell(value);

    /// <summary>Converts a number to a cell.</summary>
    /// <param name="value">The number.</param>
    public static implicit operator CanopyCell(double value) => new CanopyCell(value);

    /// <summary>Converts a number to a cell.</summary>
    /// <param name="value">The number.</param>
    public static implicit operator CanopyCell(decimal value) => new CanopyCell(value);

    /// <summary>Converts a boolean to a cell.</summary>
    /// <param name="value">The boolean.</param>
    public static implicit operator CanopyCell(bool value) => new CanopyCell(value);

    /// <summary>Converts a date and time to a cell.</summary>
    /// <param name="value">The date and time.</param>
    public static implicit operator CanopyCell(DateTime value) => new CanopyCell(value);

    /// <summary>Converts a date and time to a cell.</summary>
    /// <param name="value">The date and time.</param>
    public static implicit operator CanopyCell(DateTimeOffset value) => new CanopyCell(value);

    /// <summary>
    /// Formats the value the way the runtime does when no display text is set, for renderers that run without a
    /// browser (the static outline).
    /// </summary>
    internal string FormatValue(CanopyColumnKind kind, CanopyLabels labels) {
        switch (_value) {
            case null:
                return string.Empty;
            case string text:
                if (kind == CanopyColumnKind.DateTime
                    && DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)) {
                    return Utc(labels, parsed);
                }

                return text;
            case bool flag:
                return flag ? labels.Yes : labels.No;
            case DateTime date:
                return kind == CanopyColumnKind.DateTime ? Utc(labels, date) : FormatIso(date);
            case long whole:
                return kind == CanopyColumnKind.Number ? whole.ToString("#,0", CultureInfo.InvariantCulture) : whole.ToString(CultureInfo.InvariantCulture);
            case double real:
                return double.IsNaN(real) || double.IsInfinity(real) ? string.Empty : real.ToString(kind == CanopyColumnKind.Number ? "#,0.###" : "R", CultureInfo.InvariantCulture);
            case decimal exact:
                return exact.ToString(kind == CanopyColumnKind.Number ? "#,0.###" : "G", CultureInfo.InvariantCulture);
            default:
                return Convert.ToString(_value, CultureInfo.InvariantCulture) ?? string.Empty;
        }
    }

    /// <summary>Returns the text a reader sees: the display text when set, otherwise the formatted value.</summary>
    internal string DisplayText(CanopyColumnKind kind, CanopyLabels labels) => Text ?? FormatValue(kind, labels);

    /// <summary>Gets whether <see cref="Badges"/> holds at least one badge, without creating the collection.</summary>
    public bool HasBadges => _badges != null && _badges.Count > 0;

    /// <summary>A date in UTC as the label shows it: the first <c>{time}</c> becomes the date, as in the browser.</summary>
    private static string Utc(CanopyLabels labels, DateTime date) {
        var template = labels.UtcTime;
        var at = template.IndexOf("{time}", StringComparison.Ordinal);
        return template.Substring(0, at) + date.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + template.Substring(at + 6);
    }

    /// <summary>ISO 8601 UTC, with milliseconds only when they are not zero.</summary>
    private static string FormatIso(DateTime date) =>
        date.ToString(date.Millisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>Checks a node's cells, walking the dictionary without an enumerator object.</summary>
    internal static void ValidateEntries(Dictionary<string, CanopyCell>? cells) {
        if (cells == null) {
            return;
        }

        foreach (var cell in cells) {
            if (string.IsNullOrEmpty(cell.Key)) throw new InvalidOperationException("A cell key must identify a column.");
            cell.Value?.ValidateShape();
        }
    }

    internal static void ValidateEntries(IEnumerable<KeyValuePair<string, CanopyCell>> cells) {
        foreach (var cell in cells) {
            if (string.IsNullOrEmpty(cell.Key)) throw new InvalidOperationException("A cell key must identify a column.");
            cell.Value?.ValidateShape();
        }
    }

    internal void ValidateShape() {
        ValidateStructure(0);
        if (Secondary != null && Secondary.Length > 4096) throw new InvalidOperationException("Secondary cell text is limited to 4096 code units.");
        if (_series != null && (_series.Count > 4096 || _series.Exists(point => point == null))) throw new InvalidOperationException("Cell history supports at most 4096 non-null periods.");
        if (_sortKey is string key && key.Length > 4096) throw new InvalidOperationException("A sort key is limited to 4096 code units.");
        switch (_sortKey) {
            case long whole: CanopyJsonWriter.RequireSafeMagnitude((decimal)whole); break;
            case decimal exact: CanopyJsonWriter.RequireSafeMagnitude(exact); break;
            case double real: CanopyJsonWriter.RequireSafeMagnitude(real); break;
        }
        switch (_value) {
            case long whole: CanopyJsonWriter.RequireSafeMagnitude((decimal)whole); break;
            case decimal exact: CanopyJsonWriter.RequireSafeMagnitude(exact); break;
            case double real: CanopyJsonWriter.RequireSafeMagnitude(real); break;
        }
        if (_badges != null) {
            foreach (var badge in _badges) {
                if (badge == null) throw new InvalidOperationException("A cell cannot contain a null badge.");
            }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        ValidateShape();
        var simple = Text == null && SearchText == null && Title == null && Secondary == null && (_series == null || _series.Count == 0) && Tone == CanopyTone.None && !HasBadges &&
            _sortKey == null && !IsStructured && Ref == null;
        if (simple) {
            WriteValue(writer);
            return;
        }

        writer.BeginObject();
        if (_value != null) {
            writer.Name("value");
            WriteValue(writer);
        }

        writer.OptionalProperty("text", Text);
        writer.OptionalProperty("searchText", SearchText);
        writer.OptionalProperty("title", Title);
        writer.OptionalProperty("secondary", Secondary);
        if (_series != null && _series.Count > 0) { writer.Name("series").BeginArray(); foreach (var point in _series) point.WriteJson(writer); writer.EndArray(); }
        writer.OptionalProperty("tone", Tone.Name);
        if (_sortKey != null) {
            writer.Name("sort");
            // Date keys always carry milliseconds, so their text sorts in time order within a second too.
            if (_sortKey is DateTime date) writer.String(date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
            else WriteScalar(writer, _sortKey);
        }
        if (HasBadges) {
            writer.Name("badges").BeginArray();
            foreach (var badge in _badges!) {
                (badge ?? throw new InvalidOperationException("A cell cannot contain a null badge.")).WriteJson(writer);
            }

            writer.EndArray();
        }

        WriteStructure(writer);
        writer.EndObject();
    }

    /// <summary>Writes only the typed value, for cells and flat-grid query operands.</summary>
    internal void WriteValue(CanopyJsonWriter writer) => WriteScalar(writer, _value);

    private static void WriteScalar(CanopyJsonWriter writer, object? scalar) {
        switch (scalar) {
            case null:
                writer.Null();
                break;
            case string text:
                writer.String(text);
                break;
            case bool flag:
                writer.Boolean(flag);
                break;
            case long whole:
                writer.Number(whole);
                break;
            case double real:
                writer.Number(real);
                break;
            case decimal exact:
                writer.Number(exact);
                break;
            case DateTime date:
                // Formatting a date checks nothing, so a validating writer is not given the text.
                writer.String(writer.IsDiscarding ? string.Empty : FormatIso(date));
                break;
            default:
                throw new InvalidOperationException("Unsupported cell value type: " + scalar.GetType().FullName);
        }
    }
}
