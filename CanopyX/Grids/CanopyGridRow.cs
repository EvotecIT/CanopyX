using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A flat data-grid row with a stable host-owned identity and typed cells.</summary>
/// <remarks>
/// The identity must survive sorting, filtering, paging, and reloads. It is not a row offset or display label.
/// Cells share the tree-grid value and display contract, but a grid row has no parent or children.
/// </remarks>
public sealed class CanopyGridRow {
    /// <summary>Creates a row.</summary>
    /// <param name="id">The stable identity, unique throughout the dataset.</param>
    public CanopyGridRow(string id) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
    }

    /// <summary>Gets the stable dataset identity.</summary>
    public string Id { get; }

    /// <summary>Gets cells keyed by column identity. Omitted cells and null entries are empty values.</summary>
    public IDictionary<string, CanopyCell> Cells { get; } = new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    internal void Validate(ISet<string>? columnIds = null) {
        CanopyCell.ValidateEntries(Cells);
        foreach (var cell in Cells) {
            CanopyIdentifiers.Require(cell.Key, nameof(Cells));
            if (columnIds != null && !columnIds.Contains(cell.Key)) {
                throw new InvalidOperationException("Grid row '" + Id + "' uses undeclared column '" + cell.Key + "'.");
            }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        Validate();
        writer.BeginObject().Property("id", Id).Name("cells").BeginObject();
        foreach (var cell in Cells) {
            writer.Name(cell.Key);
            if (cell.Value == null) writer.Null();
            else cell.Value.WriteJson(writer);
        }
        writer.EndObject().EndObject();
    }
}
