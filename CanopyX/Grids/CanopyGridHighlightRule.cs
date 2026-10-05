using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An ordered raw-value condition that decorates a row or its condition column's cell.</summary>
/// <remarks>The first matching rule wins separately for the row and each cell. No host data is changed.</remarks>
public sealed class CanopyGridHighlightRule {
    /// <summary>Creates a highlight using the grid's existing typed filter operators.</summary>
    /// <param name="condition">Declared column, operator and raw operands.</param>
    /// <param name="tone">An existing semantic or host-defined tone; None leaves the current tone.</param>
    /// <param name="className">Optional additional CSS classes, at most 1,024 characters without controls.</param>
    /// <param name="target">The row, or the condition column's cell.</param>
    public CanopyGridHighlightRule(CanopyGridFilter condition, CanopyTone tone = default, string? className = null,
        CanopyGridHighlightTarget target = CanopyGridHighlightTarget.Row) {
        Condition = condition ?? throw new ArgumentNullException(nameof(condition));
        if (!Enum.IsDefined(typeof(CanopyGridHighlightTarget), target)) throw new ArgumentOutOfRangeException(nameof(target));
        ValidateClassName(className);
        if (tone == CanopyTone.None && className == null) throw new ArgumentException("A highlight requires a tone or CSS classes.");
        Tone = tone; ClassName = className; Target = target;
    }
    /// <summary>Gets the typed raw-value condition.</summary>
    public CanopyGridFilter Condition { get; }
    /// <summary>Gets the tone, or None to retain the current tone.</summary>
    public CanopyTone Tone { get; }
    /// <summary>Gets additional CSS classes.</summary>
    public string? ClassName { get; }
    /// <summary>Gets the row or condition cell target.</summary>
    public CanopyGridHighlightTarget Target { get; }

    internal static void ValidateClassName(string? value) {
        if (value == null) return;
        if (string.IsNullOrWhiteSpace(value) || value.Length > 1024) throw new ArgumentException("CSS classes must contain text and at most 1,024 characters.", nameof(value));
        foreach (var unit in value) if (char.IsControl(unit)) throw new ArgumentException("CSS classes cannot contain control characters.", nameof(value));
    }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject(); Condition.WriteFields(writer);
        if (Target == CanopyGridHighlightTarget.Cell) writer.Property("target", "cell");
        writer.OptionalProperty("tone", Tone.Name).OptionalProperty("className", ClassName).EndObject();
    }
}
