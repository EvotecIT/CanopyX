using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An ordered raw-value condition that decorates a row or its condition column's cell.</summary>
/// <remarks>The first matching rule wins separately for the row and each cell. No host data is changed.</remarks>
public sealed class CanopyGridHighlightRule {
    /// <summary>Creates a highlight using the grid's existing typed filter operators.</summary>
    /// <param name="condition">Declared column, operator and raw operands.</param>
    /// <param name="tone">A semantic or host-defined tone.</param>
    /// <param name="target">The row, or the condition column's cell.</param>
    public CanopyGridHighlightRule(CanopyGridFilter condition, Tone tone,
        CanopyGridHighlightTarget target = CanopyGridHighlightTarget.Row) {
        Condition = condition ?? throw new ArgumentNullException(nameof(condition));
        if (condition.Operator == CanopyGridFilterOperator.Custom) throw new ArgumentException("Highlight conditions use built-in operators; named hooks apply only to queries.", nameof(condition));
        if (!Enum.IsDefined(typeof(CanopyGridHighlightTarget), target)) throw new ArgumentOutOfRangeException(nameof(target));
        if (tone == Tone.None) throw new ArgumentException("A highlight requires a tone.", nameof(tone));
        Tone = tone; Target = target;
    }
    /// <summary>Gets the typed raw-value condition.</summary>
    public CanopyGridFilter Condition { get; }
    /// <summary>Gets the tone.</summary>
    public Tone Tone { get; }
    /// <summary>Gets the row or condition cell target.</summary>
    public CanopyGridHighlightTarget Target { get; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject(); Condition.WriteFields(writer);
        if (Target == CanopyGridHighlightTarget.Cell) writer.Property("target", "cell");
        writer.OptionalProperty("tone", Tone.WireName()).EndObject();
    }
}
