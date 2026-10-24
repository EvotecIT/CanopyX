using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyColumn {
    private int _maxLines = 2;

    /// <summary>Gets or sets the maximum visible wrapped text lines, from 1 to 12. Default 2; automatic row heights measure the visible lines.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 12.</exception>
    public int MaxLines {
        get => _maxLines;
        set => _maxLines = value < 1 || value > 12 ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Gets host-authored display labels keyed by exact raw text token. Raw values remain query and group keys.</summary>
    public IDictionary<string, string> ValueLabels { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets the raw category tokens in ascending order. Declared tokens precede unknown ordinal text; null retains the grid's missing-value policy.</summary>
    public IList<string> ValueOrder { get; } = new List<string>();

    /// <summary>Gets semantic category tones keyed by exact raw text token.</summary>
    public IDictionary<string, CanopyTone> ValueTones { get; } = new Dictionary<string, CanopyTone>(StringComparer.Ordinal);

    /// <summary>Gets ordered numeric text-tone rules. The first matching rule wins, including its tooltip and drawer label.</summary>
    public IList<CanopyNumericToneRule> NumericTones { get; } = new List<CanopyNumericToneRule>();
    internal bool ExactCategoryTokens => Kind == CanopyColumnKind.Text && (ValueLabels.Count != 0 || ValueOrder.Count != 0);

    internal CanopyNumericToneRule? NumericTone(CanopyCell? cell) {
        if (NumericTones.Count == 0 || Kind != CanopyColumnKind.Number || cell?.Value is not (long or double or decimal)) return null;
        var raw = CanopyNumericValues.ToDouble(cell.Value);
        if (double.IsNaN(raw) || double.IsInfinity(raw)) return null;
        foreach (var rule in NumericTones) if (rule.Matches(raw)) return rule;
        return null;
    }

    internal CanopyTone ValueTone(CanopyCell? cell) => NumericTone(cell)?.Tone ??
        (cell?.Value is string token && ValueTones.TryGetValue(token, out var tone) ? tone : cell?.Tone ?? CanopyTone.None);

    private void WriteValuesJson(CanopyJsonWriter writer) {
        if (MaxLines != 2) writer.Property("maxLines", MaxLines);
        if ((ValueLabels.Count != 0 || ValueOrder.Count != 0 || ValueTones.Count != 0) && Kind != CanopyColumnKind.Text)
            throw new InvalidOperationException("Category labels, order and tones require a text column.");
        if (NumericTones.Count != 0 && Kind != CanopyColumnKind.Number) throw new InvalidOperationException("Numeric tones require a number column.");
        if (ValueLabels.Count > 512 || ValueOrder.Count > 512 || ValueTones.Count > 512 || NumericTones.Count > 32)
            throw new InvalidOperationException("Column value declarations exceed their protocol bounds.");
        if (ValueLabels.Count != 0) {
            writer.Name("valueLabels").BeginObject();
            foreach (var pair in ValueLabels) {
                if (pair.Key.Length > 4096 || pair.Value == null || pair.Value.Length > 4096) throw new InvalidOperationException("Category labels are bounded to 4096 characters.");
                writer.Property(pair.Key, pair.Value);
            }
            writer.EndObject();
        }
        if (ValueOrder.Count != 0) {
            // Reuse the canonical ordinal category validator; these tokens are exact and culture-independent.
            _ = new CanopyGridOrdering(CanopyGridTextOrder.Ordinal, ValueOrder);
            writer.Name("valueOrder").BeginArray();
            foreach (var token in ValueOrder) writer.String(token);
            writer.EndArray();
        }
        if (ValueTones.Count != 0) {
            writer.Name("valueTones").BeginObject();
            foreach (var pair in ValueTones) {
                if (pair.Key.Length > 4096 || pair.Value == CanopyTone.None) throw new InvalidOperationException("Category tones need a bounded token and tone.");
                writer.Property(pair.Key, pair.Value.Name!);
            }
            writer.EndObject();
        }
        if (NumericTones.Count != 0) {
            writer.Name("numericTones").BeginArray();
            foreach (var rule in NumericTones) (rule ?? throw new InvalidOperationException("A numeric rule is required.")).WriteJson(writer);
            writer.EndArray();
        }
    }
}
