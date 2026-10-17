using System;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The checks an edited value of a flat-grid column must pass (<see cref="CanopyColumn.Validation"/>): required, a number or
/// date range, a text length and a pattern. The browser's editing part applies them as the reader edits, with translated
/// messages (or <see cref="Message"/>), before a row can commit.
/// </summary>
/// <remarks>
/// These are presentation checks that mirror the host's rules; the host still validates and authorizes every change it
/// receives. A browser host adds its own checks with <c>editing.validators</c> and <c>editing.validateRow</c>. See docs/editing.md.
/// </remarks>
public sealed class CanopyCellValidation {
    private int? _minLength;
    private int? _maxLength;

    /// <summary>Gets or sets whether the value cannot be empty.</summary>
    public bool Required { get; set; }

    /// <summary>Gets or sets the smallest value of a number column.</summary>
    public double? Minimum { get; set; }

    /// <summary>Gets or sets the largest value of a number column.</summary>
    public double? Maximum { get; set; }

    /// <summary>Gets or sets the earliest moment of a date-and-time column, compared at UTC millisecond precision.</summary>
    public DateTimeOffset? Earliest { get; set; }

    /// <summary>Gets or sets the latest moment of a date-and-time column, compared at UTC millisecond precision.</summary>
    public DateTimeOffset? Latest { get; set; }

    /// <summary>The largest <see cref="MinLength"/> or <see cref="MaxLength"/>, as the protocol bounds it.</summary>
    public const int MaxTextLength = 1000000;

    /// <summary>Gets or sets the fewest characters of a text value, from 0 to <see cref="MaxTextLength"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The length is outside 0 to <see cref="MaxTextLength"/>.</exception>
    public int? MinLength {
        get => _minLength;
        set => _minLength = value < 0 || value > MaxTextLength ? throw new ArgumentOutOfRangeException(nameof(value), value, "A length is from 0 to 1,000,000.") : value;
    }

    /// <summary>Gets or sets the most characters of a text value, from 0 to <see cref="MaxTextLength"/>.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The length is outside 0 to <see cref="MaxTextLength"/>.</exception>
    public int? MaxLength {
        get => _maxLength;
        set => _maxLength = value < 0 || value > MaxTextLength ? throw new ArgumentOutOfRangeException(nameof(value), value, "A length is from 0 to 1,000,000.") : value;
    }

    /// <summary>
    /// Gets or sets a regular expression the whole text value must match. Write it in the syntax JavaScript and .NET share
    /// (the browser compiles it with JavaScript's <c>RegExp</c>, anchored at both ends); it is checked here with
    /// <see cref="RegexOptions.ECMAScript"/>.
    /// </summary>
    public string? Pattern { get; set; }

    /// <summary>Gets or sets one message for every failed check of this column, in place of the translated defaults.</summary>
    public string? Message { get; set; }

    internal void Validate(CanopyColumn column) {
        var number = column.Kind == CanopyColumnKind.Number;
        if (!number && (Minimum.HasValue || Maximum.HasValue)) throw new InvalidOperationException("Minimum and Maximum check number columns.");
        if (column.Kind != CanopyColumnKind.DateTime && (Earliest.HasValue || Latest.HasValue)) throw new InvalidOperationException("Earliest and Latest check date-and-time columns.");
        if (column.Kind != CanopyColumnKind.Text && (MinLength.HasValue || MaxLength.HasValue || Pattern != null))
            throw new InvalidOperationException("Lengths and patterns check text columns.");
        foreach (var bound in new[] { Minimum, Maximum }) {
            if (bound.HasValue && (double.IsNaN(bound.Value) || double.IsInfinity(bound.Value) || Math.Abs(bound.Value) > 9007199254740991d))
                throw new InvalidOperationException("Validation limits must be finite and within the safe integer magnitude.");
        }
        if (Minimum > Maximum || Earliest > Latest || MinLength > MaxLength) throw new InvalidOperationException("A lower limit cannot exceed its upper limit.");
        if (Message != null && (Message.Trim().Length == 0 || Message.Length > 1024)) throw new InvalidOperationException("A validation message needs visible text of at most 1024 characters.");
        if (Pattern != null) {
            CanopyPattern.Validate(Pattern, whole: true);
            // The pattern must compile on its own too, so a stray parenthesis cannot escape the anchors the browser adds.
            try { _ = new Regex(Pattern, RegexOptions.ECMAScript, TimeSpan.FromSeconds(1)); _ = new Regex("^(?:" + Pattern + ")$", RegexOptions.ECMAScript, TimeSpan.FromSeconds(1)); }
            catch (ArgumentException error) { throw new InvalidOperationException("Column " + column.Id + " has an invalid pattern.", error); }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Required) writer.Property("required", true);
        if (Minimum.HasValue) writer.Name("min").Number(Minimum.Value);
        else if (Earliest.HasValue) writer.Property("min", CanopyCell.FormatIso(Earliest.Value.UtcDateTime));
        if (Maximum.HasValue) writer.Name("max").Number(Maximum.Value);
        else if (Latest.HasValue) writer.Property("max", CanopyCell.FormatIso(Latest.Value.UtcDateTime));
        writer.OptionalProperty("minLength", MinLength).OptionalProperty("maxLength", MaxLength)
            .OptionalProperty("pattern", Pattern).OptionalProperty("message", Message);
        writer.EndObject();
    }
}
