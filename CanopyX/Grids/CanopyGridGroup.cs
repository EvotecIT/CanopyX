using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A complete-query group with a stable host key, raw value and contiguous record range.</summary>
public sealed class CanopyGridGroup {
    /// <summary>Creates a nonempty group range.</summary>
    /// <param name="key">Stable key, bounded to 4096 characters. It must not be a page-local index.</param>
    /// <param name="value">Raw grouping value. Null includes missing cells.</param>
    /// <param name="offset">First record ordinal in the complete accepted query.</param>
    /// <param name="count">Number of records in this group, including other pages and collapsed leaves.</param>
    public CanopyGridGroup(string key, CanopyCell? value, int offset, int count) {
        CanopyIdentifiers.Require(key, nameof(key));
        if (key.Length > 4096) throw new ArgumentOutOfRangeException(nameof(key));
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
        Key = key; Value = value; Offset = offset; Count = count;
    }
    /// <summary>Gets the stable group key.</summary>
    public string Key { get; }
    /// <summary>Gets the raw grouping value, independent of formatted display text.</summary>
    public CanopyCell? Value { get; }
    /// <summary>Gets the first accepted record ordinal.</summary>
    public int Offset { get; }
    /// <summary>Gets the complete group record count.</summary>
    public int Count { get; }
    /// <summary>Gets full-group raw numeric aggregate values keyed by the declared aggregate identity.</summary>
    public IDictionary<string, double?> Aggregates { get; } = new Dictionary<string, double?>(StringComparer.Ordinal);
    /// <summary>Gets optional host-owned display cells keyed by declared column identity, such as the worst state of a complete group.</summary>
    /// <remarks>These cells use the column presenter and never participate in record queries, sorting or exports. Numeric aggregates take precedence.</remarks>
    public IDictionary<string, CanopyCell> Cells { get; } = new Dictionary<string, CanopyCell>(StringComparer.Ordinal);
    internal void WriteJson(CanopyJsonWriter writer, CanopyGridView view) {
        CanopyCell.ValidateEntries(Cells);
        foreach (var entry in Cells) {
            CanopyColumn? column = null;
            foreach (var declared in view.Columns) if (declared.Id == entry.Key) column = declared;
            if (column == null) throw new InvalidOperationException("Group cells must use declared column identities.");
            CanopyGridValues.ValidateCell(entry.Value, column);
        }
        writer.BeginObject().Property("key", Key).Name("value");
        if (Value == null) writer.Null(); else Value.WriteValue(writer);
        writer.Property("offset", Offset).Property("count", Count);
        CanopyGridSummary.WriteAggregates(writer, Aggregates, view, Count);
        if (Cells.Count > 0) {
            writer.Name("cells").BeginObject();
            foreach (var entry in Cells) {
                writer.Name(entry.Key);
                if (entry.Value == null) writer.Null(); else entry.Value.WriteJson(writer);
            }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
