using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Fresh counts and rollup values for one node, applied to the loaded node without reloading its children.
/// </summary>
public sealed class CanopyCountEntry {
    private int? _childCount;
    private Dictionary<string, CanopyCell>? _cells;

    /// <summary>Creates an entry.</summary>
    /// <param name="id">The id of the node to update.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is null, empty, or contains unpaired surrogates.</exception>
    public CanopyCountEntry(string id) {
        CanopyIdentifiers.Require(id, nameof(id));

        Id = id;
    }

    /// <summary>Gets the id of the node to update.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the node's new total number of children.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? ChildCount {
        get => _childCount;
        set {
            if (value < 0) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Child count cannot be negative.");
            }

            _childCount = value;
        }
    }

    /// <summary>Gets cells that replace the node's cells with the same column ids, for example a "changed below" count.</summary>
    public IDictionary<string, CanopyCell> Cells => _cells ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>
    /// Gets or sets flags that replace the node's flags, or <see langword="null"/> (the default) to keep them.
    /// </summary>
    public IList<string>? Flags { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        if (_cells != null) CanopyCell.ValidateEntries(_cells);
        writer.BeginObject().Property("id", Id);
        writer.OptionalProperty("childCount", _childCount);
        if (_cells != null && _cells.Count > 0) {
            writer.Name("cells").BeginObject();
            foreach (var cell in _cells) {
                writer.Name(cell.Key);
                if (cell.Value == null) {
                    writer.Null();
                } else {
                    cell.Value.WriteJson(writer);
                }
            }

            writer.EndObject();
        }

        if (Flags != null) {
            foreach (var flag in Flags) {
                if (string.IsNullOrEmpty(flag)) {
                    throw new InvalidOperationException("Counts entry '" + Id + "' has an empty flag.");
                }
            }

            writer.StringArray("flags", Flags);
        }

        writer.EndObject();
    }
}
