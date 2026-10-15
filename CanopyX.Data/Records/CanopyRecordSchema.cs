using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>The allow-list of a record endpoint: the record panel fields it serves and the grid columns it gives fuller
/// drawer values (<c>cells</c>), bound to the grid's column allow-list.</summary>
/// <remarks>
/// A <c>gridRecordQuery</c> may only reach these fields. Each field must be declared by the view's record panel, each cell
/// column by the view. The schema copies the lists when it is created; later changes to the view do not apply.
/// </remarks>
public sealed class CanopyRecordSchema {
    private readonly Dictionary<string, CanopyRecordField> _byId = new Dictionary<string, CanopyRecordField>(StringComparer.Ordinal);

    /// <summary>Creates a record allow-list.</summary>
    /// <param name="data">The grid's column allow-list; its view must declare a record panel.</param>
    /// <param name="fields">The record panel fields the endpoint serves.</param>
    /// <param name="cells">The view columns whose fuller drawer values the endpoint serves; null serves none.</param>
    /// <exception cref="ArgumentException">The view has no record panel, or a field or column is undeclared or listed twice.</exception>
    public CanopyRecordSchema(CanopyDataSchema data, IEnumerable<CanopyRecordField> fields, IEnumerable<string>? cells = null) {
        Data = data ?? throw new ArgumentNullException(nameof(data));
        if (fields == null) throw new ArgumentNullException(nameof(fields));
        var panel = data.View.Record ?? throw new ArgumentException("View '" + data.ViewId + "' declares no record panel (Record).", nameof(data));
        var declared = new HashSet<string>(StringComparer.Ordinal);
        foreach (var field in panel.Fields) if (field != null) declared.Add(field.Id);
        var list = new List<CanopyRecordField>();
        foreach (var field in fields) {
            if (field == null) throw new ArgumentException("A record schema cannot list a null field.", nameof(fields));
            if (!declared.Contains(field.Id)) throw new ArgumentException("Field '" + field.Id + "' is not a record field of view '" + data.ViewId + "'.", nameof(fields));
            if (_byId.ContainsKey(field.Id)) throw new ArgumentException("Field '" + field.Id + "' is listed twice.", nameof(fields));
            _byId.Add(field.Id, field);
            list.Add(field);
        }
        var columns = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in data.View.Columns) columns.Add(column.Id);
        var cellList = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (cells != null) foreach (var id in cells) {
            if (id == null || !columns.Contains(id)) throw new ArgumentException("Column '" + id + "' is not declared by view '" + data.ViewId + "'.", nameof(cells));
            if (!seen.Add(id)) throw new ArgumentException("Column '" + id + "' is listed twice.", nameof(cells));
            cellList.Add(id);
        }
        Fields = new ReadOnlyCollection<CanopyRecordField>(list);
        Cells = new ReadOnlyCollection<string>(cellList);
    }

    /// <summary>Gets the grid's column allow-list.</summary>
    public CanopyDataSchema Data { get; }

    /// <summary>Gets the grid definition.</summary>
    public CanopyDataGridView View => Data.View;

    /// <summary>Gets the grid identity.</summary>
    public string ViewId => Data.ViewId;

    /// <summary>Gets the served record fields, in order.</summary>
    public IReadOnlyList<CanopyRecordField> Fields { get; }

    /// <summary>Gets the view columns whose fuller drawer values are served.</summary>
    public IReadOnlyList<string> Cells { get; }

    /// <summary>Finds a served record field.</summary>
    /// <param name="id">The field identity.</param>
    /// <param name="field">The field, when served.</param>
    /// <returns>True when the field is served.</returns>
    public bool TryGetField(string id, out CanopyRecordField field) => _byId.TryGetValue(id ?? string.Empty, out field!);
}
