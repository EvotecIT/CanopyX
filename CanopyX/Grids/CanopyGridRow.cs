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

    /// <summary>Gets or sets the row's default semantic or host-defined tone.</summary>
    public CanopyTone Tone { get; set; }
    /// <summary>Gets or sets additional row CSS classes, at most 1,024 characters without controls.</summary>
    public string? ClassName { get; set; }

    internal void Validate(ISet<string>? columnIds = null, IDictionary<string, CanopyColumn>? columns = null) {
        CanopyCell.ValidateEntries(Cells);
        CanopyGridHighlightRule.ValidateClassName(ClassName);
        foreach (var cell in Cells) {
            CanopyIdentifiers.Require(cell.Key, nameof(Cells));
            if (columnIds != null && !columnIds.Contains(cell.Key)) {
                throw new InvalidOperationException("Grid row '" + Id + "' uses undeclared column '" + cell.Key + "'.");
            }
            if (columns != null && columns.TryGetValue(cell.Key, out var column)) CanopyGridValues.ValidateCell(cell.Value, column);
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
        writer.EndObject().OptionalProperty("tone", Tone.Name).OptionalProperty("className", ClassName).EndObject();
    }

    /// <summary>Writes the compact row of <c>rowData</c>: the id (or an object with the id, tone and class) and the cells in column order, without trailing empty cells.</summary>
    internal void WriteCompactJson(CanopyJsonWriter writer, IReadOnlyList<string> columns) {
        Validate();
        writer.BeginArray();
        if (Tone.Name == null && ClassName == null) writer.String(Id);
        else writer.BeginObject().Property("id", Id).OptionalProperty("tone", Tone.Name).OptionalProperty("className", ClassName).EndObject();
        var last = -1;
        for (var i = 0; i < columns.Count; i++) {
            if (Cells.TryGetValue(columns[i], out var cell) && cell != null) last = i;
        }
        for (var i = 0; i <= last; i++) {
            if (Cells.TryGetValue(columns[i], out var cell) && cell != null) cell.WriteJson(writer);
            else writer.Null();
        }
        writer.EndArray();
    }
}
