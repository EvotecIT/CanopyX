using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

/// <summary>
/// The server's checks of a changed row: every value against its column's kind, the view's validation (required, minimum,
/// maximum, lengths, pattern) and editor (step, choices, toggles), as the browser's editing part checks it. Values come out
/// typed: text, booleans, numbers as <see cref="double"/>, dates as UTC <see cref="DateTime"/> at millisecond precision.
/// </summary>
internal static class CommitValidation {
    private const double SafeInteger = 9007199254740991d;
    private static readonly Regex IsoInstant = new Regex(@"^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$", RegexOptions.CultureInvariant);
    private static readonly ConcurrentDictionary<string, Regex> Patterns = new ConcurrentDictionary<string, Regex>(StringComparer.Ordinal);

    /// <summary>Checks a row (an insert also for the required columns it leaves out); returns the typed row, or null with messages by column.</summary>
    internal static CanopyCommitRow? Check(CanopyDataSchema schema, CanopyCommitRow row, CanopyCommitMessages messages, Dictionary<string, string> errors) {
        var values = new Dictionary<string, object?>(StringComparer.Ordinal);
        var original = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var pair in row.Values) {
            var column = schema.GetColumn(pair.Key);
            if (!column.Editable) throw new CanopyRequestException(CanopyRequestError.ColumnNotEditable, "The column cannot be edited on this endpoint.");
            var error = Value(column, pair.Value, messages, out var typed);
            if (error != null) errors[column.Id] = error; else values[column.Id] = typed;
            if (row.Operation == CanopyCommitOperation.Update) {
                row.Original.TryGetValue(pair.Key, out var start);
                original[column.Id] = Original(column, start);
            }
        }
        if (row.Operation == CanopyCommitOperation.Insert) {
            // A new record holds only the values it is given: a required editable column it leaves out is empty.
            foreach (var column in schema.EditableColumns) {
                if (column.Validation?.Required == true && !row.Values.ContainsKey(column.Id) && !errors.ContainsKey(column.Id))
                    errors[column.Id] = column.Validation.Message ?? CanopyCommitMessages.Fill(messages.Required, column);
            }
            return errors.Count == 0 ? CanopyCommitRow.Insert(row.Id, values) : null;
        }
        return errors.Count == 0 ? new CanopyCommitRow(row.Id, values, original) : null;
    }

    private static string? Value(CanopyDataColumn column, object? raw, CanopyCommitMessages messages, out object? typed) {
        var rules = column.Validation;
        var editor = column.Editor;
        string Say(string template, string? name = null, string? value = null) =>
            rules?.Message ?? CanopyCommitMessages.Fill(template, column, name == null ? null : new Dictionary<string, string> { [name] = value! });
        typed = raw;
        if (raw is null || raw is string empty && empty.Length == 0) {
            if (rules?.Required == true) return Say(messages.Required);
            // An emptied number or date is a missing value; emptied text stays the empty string, which is a value.
            if (column.Kind != CanopyColumnKind.Text) typed = null;
            // The optional select's None choice is null. Empty text remains a value and must be listed explicitly.
            if (typed != null && editor?.Kind == CanopyCellEditorKind.Select && editor.Options.Count > 0) {
                var blank = false;
                foreach (var option in editor.Options) blank |= option.Value is string choice && choice.Length == 0;
                if (!blank) return Say(messages.Choice);
            }
            return null;
        }
        switch (column.Kind) {
            case CanopyColumnKind.Number: {
                if (!TryNumber(raw, out var number)) return Say(messages.Number);
                var minimum = rules?.Minimum ?? editor?.Minimum;
                var maximum = rules?.Maximum ?? editor?.Maximum;
                if (minimum.HasValue && number < minimum.Value) return Say(messages.Minimum, "min", Format(minimum.Value));
                if (maximum.HasValue && number > maximum.Value) return Say(messages.Maximum, "max", Format(maximum.Value));
                var step = editor?.Step;
                if (step.HasValue) {
                    var steps = (number - (minimum ?? 0)) / step.Value;
                    if (Math.Abs(steps - Math.Round(steps)) > 1e-9) return Say(messages.Step, "step", Format(step.Value));
                }
                typed = number;
                break;
            }
            case CanopyColumnKind.DateTime: {
                if (!TryInstant(raw, out var instant)) return Say(messages.Date);
                if (rules?.Earliest.HasValue == true && instant < CanopyDataValues.TruncateToMilliseconds(rules.Earliest.Value.UtcDateTime)) return Say(messages.Minimum, "min", CanopyDataValues.FormatDate(rules.Earliest.Value.UtcDateTime));
                if (rules?.Latest.HasValue == true && instant > CanopyDataValues.TruncateToMilliseconds(rules.Latest.Value.UtcDateTime)) return Say(messages.Maximum, "max", CanopyDataValues.FormatDate(rules.Latest.Value.UtcDateTime));
                typed = instant;
                break;
            }
            default: {
                if (raw is bool) {
                    if (editor != null && editor.Kind != CanopyCellEditorKind.Toggle && editor.Kind != CanopyCellEditorKind.Select && editor.Kind != CanopyCellEditorKind.Custom) return Say(messages.Type);
                    break;
                }
                if (!(raw is string text)) return Say(messages.Type);
                if (editor?.Kind == CanopyCellEditorKind.Toggle) return Say(messages.Type);
                if (rules?.MinLength.HasValue == true && text.Length < rules.MinLength.Value) return Say(messages.MinimumLength, "min", rules.MinLength.Value.ToString(CultureInfo.InvariantCulture));
                if (rules?.MaxLength.HasValue == true && text.Length > rules.MaxLength.Value) return Say(messages.MaximumLength, "max", rules.MaxLength.Value.ToString(CultureInfo.InvariantCulture));
                if (rules?.Pattern != null && !Matches(rules.Pattern, text)) return Say(messages.Pattern);
                break;
            }
        }
        if (editor?.Kind == CanopyCellEditorKind.Select && editor.Options.Count > 0) {
            var listed = false;
            foreach (var option in editor.Options) listed |= Same(option.Value, typed);
            if (!listed) return Say(messages.Choice);
        }
        return null;
    }

    /// <summary>The reader's starting value in the column's raw shape, as far as it has one; it is only compared, never written.</summary>
    private static object? Original(CanopyDataColumn column, object? raw) {
        if (raw is string empty && empty.Length == 0 && column.Kind != CanopyColumnKind.Text) return null;
        if (column.Kind == CanopyColumnKind.Number && TryNumber(raw, out var number)) return number;
        if (column.Kind == CanopyColumnKind.DateTime && raw != null && TryInstant(raw, out var instant)) return instant;
        return raw;
    }

    private static bool TryNumber(object? raw, out double number) {
        number = 0;
        switch (raw) {
            case double value: number = value; break;
            case float value: number = value; break;
            case decimal value: number = CanopyDataValues.ToDouble(value); break;
            case long value: number = value; break;
            case int value: number = value; break;
            default: return false;
        }
        return !double.IsNaN(number) && !double.IsInfinity(number) && Math.Abs(number) <= SafeInteger;
    }

    private static bool TryInstant(object raw, out DateTime instant) {
        instant = default;
        if (raw is DateTime date) {
            instant = CanopyDataValues.TruncateToMilliseconds((DateTime)CanopyDataValues.Normalize(date)!);
            return true;
        }
        if (raw is DateTimeOffset offset) {
            instant = CanopyDataValues.TruncateToMilliseconds(offset.UtcDateTime);
            return true;
        }
        if (!(raw is string text) || text.Length > 64 || !IsoInstant.IsMatch(text) ||
            !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) return false;
        if (parsed.UtcDateTime.Year < 2 || parsed.UtcDateTime.Year > 9998) return false;
        instant = CanopyDataValues.TruncateToMilliseconds(parsed.UtcDateTime);
        return true;
    }

    /// <summary>Whether the whole text matches the pattern in the syntax JavaScript and .NET share; a match that runs too long fails.</summary>
    private static bool Matches(string pattern, string text) {
        var regex = Compile(pattern);
        try {
            var match = regex.Match(text);
            // .NET's $ also matches before a final line feed; JavaScript's does not.
            return match.Success && match.Index == 0 && match.Length == text.Length;
        } catch (RegexMatchTimeoutException) {
            return false;
        }
    }

    /// <summary>The anchored pattern of a column, compiled once; throws <see cref="ArgumentException"/> when it does not compile.</summary>
    internal static Regex Compile(string pattern) =>
        Patterns.GetOrAdd(pattern, value => new Regex("^(?:" + value + ")$", RegexOptions.ECMAScript, TimeSpan.FromMilliseconds(250)));

    /// <summary>Matches a choice after validation, including date choices at the protocol's UTC millisecond precision.</summary>
    private static bool Same(object option, object? value) => option switch {
        string text => value is string other && string.Equals(text, other, StringComparison.Ordinal)
            || value is DateTime instant && TryInstant(text, out var choice) && instant == choice,
        double number => value is double other && number.Equals(other),
        bool flag => value is bool other && flag == other,
        _ => false
    };

    private static string Format(double value) => CanopyDataValues.FormatNumber(value);
}
