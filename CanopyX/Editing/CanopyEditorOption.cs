using System;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One choice of a select or lookup editor: the raw value the cell stores and the label the reader sees.</summary>
public sealed class CanopyEditorOption {
    /// <summary>Creates a text choice.</summary>
    /// <param name="value">The value the cell stores.</param>
    /// <param name="label">The label the reader sees; null shows the value.</param>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyEditorOption(string value, string? label = null) {
        Value = value ?? throw new ArgumentNullException(nameof(value));
        Label = label;
    }

    /// <summary>Creates a numeric choice.</summary>
    /// <param name="value">The value the cell stores; finite and within the protocol's safe integer magnitude.</param>
    /// <param name="label">The label the reader sees; null shows the value.</param>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="value"/> is not finite or is too large.</exception>
    public CanopyEditorOption(double value, string? label = null) {
        if (double.IsNaN(value) || double.IsInfinity(value) || Math.Abs(value) > 9007199254740991d)
            throw new ArgumentOutOfRangeException(nameof(value), value, "Option values must be finite and within the safe integer magnitude.");
        Value = value;
        Label = label;
    }

    /// <summary>Creates a true or false choice.</summary>
    /// <param name="value">The value the cell stores.</param>
    /// <param name="label">The label the reader sees; null shows the value.</param>
    public CanopyEditorOption(bool value, string? label = null) {
        Value = value;
        Label = label;
    }

    /// <summary>Gets the value the cell stores: a string, a double or a boolean.</summary>
    public object Value { get; }

    /// <summary>Gets the label the reader sees; null shows the value.</summary>
    public string? Label { get; }

    internal bool Fits(CanopyColumnKind kind) => kind switch {
        CanopyColumnKind.Number => Value is double,
        CanopyColumnKind.DateTime => Value is string text && IsInstant(text),
        _ => Value is string || Value is bool
    };

    private static bool IsInstant(string text) {
        // A datetime choice uses the same zoned ISO value the browser stores, never a local or date-only value.
        return System.Text.RegularExpressions.Regex.IsMatch(text, @"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$", System.Text.RegularExpressions.RegexOptions.CultureInvariant)
            && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var moment)
            && moment.UtcDateTime >= new DateTime(2, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            && moment.UtcDateTime <= new DateTime(9998, 12, 31, 23, 59, 59, DateTimeKind.Utc);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("value");
        if (Value is string text) writer.String(text);
        else if (Value is double number) writer.Number(number);
        else writer.Boolean((bool)Value);
        writer.OptionalProperty("label", Label).EndObject();
    }

    /// <summary>Returns the label, or the value as invariant text.</summary>
    /// <returns>The text the reader sees.</returns>
    public override string ToString() => Label ?? Convert.ToString(Value, CultureInfo.InvariantCulture) ?? string.Empty;
}
