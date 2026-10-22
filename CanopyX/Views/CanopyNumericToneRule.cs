using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable rule coloring numeric text. The first matching rule in the column wins.</summary>
public sealed class CanopyNumericToneRule {
    /// <summary>Creates a rule over the raw numeric cell value.</summary>
    /// <param name="operator">The threshold comparison.</param>
    /// <param name="value">A finite threshold.</param>
    /// <param name="tone">The semantic text tone.</param>
    /// <param name="label">The host-authored explanation shown in the tooltip and record drawer.</param>
    /// <exception cref="ArgumentException">The label is empty or longer than 4096 characters, or the tone is missing.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The comparison is unknown or the threshold is not finite.</exception>
    public CanopyNumericToneRule(CanopyNumericToneOperator @operator, double value, CanopyTone tone, string label) {
        if (!Enum.IsDefined(typeof(CanopyNumericToneOperator), @operator)) throw new ArgumentOutOfRangeException(nameof(@operator));
        if (double.IsNaN(value) || double.IsInfinity(value)) throw new ArgumentOutOfRangeException(nameof(value));
        if (tone == CanopyTone.None) throw new ArgumentException("A text tone is required.", nameof(tone));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 4096) throw new ArgumentException("A bounded rule label is required.", nameof(label));
        Operator = @operator; Value = value; Tone = tone; Label = label;
    }

    /// <summary>Gets the threshold comparison.</summary>
    public CanopyNumericToneOperator Operator { get; }
    /// <summary>Gets the finite threshold.</summary>
    public double Value { get; }
    /// <summary>Gets the semantic text tone.</summary>
    public CanopyTone Tone { get; }
    /// <summary>Gets the host-authored tooltip and drawer explanation.</summary>
    public string Label { get; }

    /// <summary>Tests a finite raw number against this rule.</summary>
    /// <param name="value">The raw number.</param>
    /// <returns>Whether the comparison matches. Non-finite values never match.</returns>
    public bool Matches(double value) => !double.IsNaN(value) && !double.IsInfinity(value) &&
        (Operator == CanopyNumericToneOperator.AtMost ? value <= Value : Operator == CanopyNumericToneOperator.AtLeast ? value >= Value :
         Operator == CanopyNumericToneOperator.Below ? value < Value : value > Value);

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject()
        .Property("operator", Operator == CanopyNumericToneOperator.AtMost ? "atMost" : Operator == CanopyNumericToneOperator.AtLeast ? "atLeast" : Operator == CanopyNumericToneOperator.Below ? "below" : "above")
        .Name("value").Number(Value).Property("tone", Tone.Name!).Property("label", Label).EndObject();
}
