using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One record's details, loaded when its drawer opens: the answer to a <see cref="CanopyGridRecordQuery"/> (a <c>gridRecord</c>
/// document) and an entry of a record pack (<see cref="CanopyRecordSidecar"/>).
/// </summary>
/// <remarks>
/// <see cref="Fields"/> holds record field values, <see cref="Cells"/> fuller values of grid columns for the drawer (a list whose grid
/// cell carries only "4 names", for example), and <see cref="Row"/> the record's row when the browser has not loaded it. An answer to
/// a collection page holds that field alone, with the requested rows and the collection's total.
/// </remarks>
public sealed class CanopyGridRecord {
    private Dictionary<string, CanopyCell>? _cells, _fields;

    /// <summary>Creates a record's details.</summary>
    /// <param name="id">The record's identity.</param>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public CanopyGridRecord(string id) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
    }

    /// <summary>Gets the record's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the dataset revision the details belong to; it must match the request's revision.</summary>
    public string? Revision { get; set; }

    /// <summary>Gets values of grid columns that replace the row's cells in the drawer, by column id.</summary>
    public IDictionary<string, CanopyCell> Cells => _cells ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Gets the record field values, by field id.</summary>
    public IDictionary<string, CanopyCell> Fields => _fields ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Gets or sets the record's row, for a record the browser has not loaded (a deep link or a related record).</summary>
    public CanopyGridRow? Row { get; set; }

    /// <summary>Writes the HTML-safe <c>gridRecord</c> answer, checked against the grid's columns and record panel.</summary>
    /// <param name="view">The grid definition.</param>
    /// <returns>The document.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">A value names an undeclared column or field, or the row is another record.</exception>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridRecord").Property("view", view.Id).Property("id", Id).OptionalProperty("revision", Revision);
        WriteContent(writer, ColumnIds(view.Columns), view.Record, view.Columns, view.Reporting?.Detail);
        return writer.EndObject().ToString();
    }

    /// <summary>Writes the HTML-safe <c>gridRecord</c> answer for a tree's record panel; a tree answers without a row.</summary>
    /// <param name="view">The tree view.</param>
    /// <returns>The document.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">A value names an undeclared column or field, or a row is set.</exception>
    public string ToJson(CanopyTreeView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (Row != null) throw new InvalidOperationException("A tree's record answers without a row.");
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridRecord").Property("view", view.Id).Property("id", Id).OptionalProperty("revision", Revision);
        WriteContent(writer, ColumnIds(view.Columns), view.Record, null);
        return writer.EndObject().ToString();
    }

    /// <summary>Whether a cell or field has the key.</summary>
    internal bool HasKey(string key) => _cells?.ContainsKey(key) == true || _fields?.ContainsKey(key) == true || Row?.Cells.ContainsKey(key) == true;

    internal static HashSet<string> ColumnIds(IEnumerable<CanopyColumn> columns) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in columns) ids.Add(column.Id);
        return ids;
    }

    /// <summary>Writes cells, fields and row after the caller's opening fields.</summary>
    internal void WriteContent(CanopyJsonWriter writer, ISet<string> columns, CanopyRecordPanel? record, IList<CanopyColumn>? gridColumns, CanopyGridDetail? detail = null) {
        if (Revision != null) CanopyIdentifiers.Require(Revision, nameof(Revision));
        if (_cells?.Count > 0) {
            writer.Name("cells").BeginObject();
            foreach (var cell in _cells) {
                if (!columns.Contains(cell.Key)) throw new InvalidOperationException("Record '" + Id + "' has a cell for undeclared column '" + cell.Key + "'.");
                writer.Name(cell.Key); if (cell.Value == null) writer.Null(); else cell.Value.WriteJson(writer);
            }
            writer.EndObject();
        }
        if (_fields?.Count > 0) {
            writer.Name("fields").BeginObject();
            foreach (var field in _fields) {
                var declared = false;
                if (record != null) foreach (var item in record.Fields) declared |= item.Id == field.Key;
                if (!declared) throw new InvalidOperationException("Record '" + Id + "' has an undeclared record field '" + field.Key + "'.");
                writer.Name(field.Key); if (field.Value == null) writer.Null(); else field.Value.WriteJson(writer);
            }
            writer.EndObject();
        }
        if (Row != null) {
            if (Row.Id != Id) throw new InvalidOperationException("A record's row must be the record itself.");
            if (gridColumns != null) CanopyGridRows.Validate(new[] { Row }, columns, gridColumns, detail);
            writer.Name("row"); Row.WriteJson(writer);
        }
    }
}
