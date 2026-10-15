using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A collection of records inside a value (<see cref="CanopyCell.Records"/>): rows with their own columns, or tree nodes. The record
/// panel shows it as a nested grid (or tree) with its own sorting, search and paging, as cards on phones, and as a table in print.
/// </summary>
/// <remarks>
/// <see cref="Rows"/> may be the first page of a longer list: set <see cref="Total"/>, and the panel offers "Load more", which asks
/// the record's source for the field's next rows (a <c>gridRecordQuery</c> with <c>field</c>, <c>offset</c> and <c>limit</c>).
/// Collections never join queries, search, sorting, column menus, exports or saved views of the grid around them.
/// </remarks>
public sealed class CanopyRecordList {
    private int? _total, _pageLength, _pageSize;

    /// <summary>Gets the columns of the collection. A tree collection's first column shows the node labels.</summary>
    public IList<CanopyColumn> Columns { get; } = new List<CanopyColumn>();

    /// <summary>Gets the rows, with identities unique within the collection.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Gets the top-level nodes of a tree collection, with their inline children; used instead of <see cref="Rows"/>.</summary>
    public IList<CanopyNode> Roots { get; } = new List<CanopyNode>();

    /// <summary>Gets or sets the number of records in the whole collection when <see cref="Rows"/> holds only the first ones.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? Total { get => _total; set => _total = value < 0 ? throw new ArgumentOutOfRangeException(nameof(value)) : value; }

    /// <summary>Gets or sets how many rows a page of the nested grid shows, 1 to 100. Null uses 10.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 100.</exception>
    public int? PageLength { get => _pageLength; set => _pageLength = value < 1 || value > 100 ? throw new ArgumentOutOfRangeException(nameof(value)) : value; }

    /// <summary>Gets or sets how many rows "Load more" asks for, 1 to 10,000. Null uses 50.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 10,000.</exception>
    public int? PageSize { get => _pageSize; set => _pageSize = value < 1 || value > 10000 ? throw new ArgumentOutOfRangeException(nameof(value)) : value; }

    /// <summary>Gets or sets the grid whose records the rows are: rows open their record there, and "Open all in grid" filters it.</summary>
    public CanopyRecordTarget? Target { get; set; }

    /// <summary>Checks the collection; depth is how deep it sits in structured values, which its rows' values continue.</summary>
    internal void Validate(int depth = 0) {
        if (Columns.Count == 0 || Columns.Count > 256) throw new InvalidOperationException("A collection has 1 to 256 columns.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in Columns) if (column == null || !ids.Add(column.Id)) throw new InvalidOperationException("Collection columns need unique identities.");
        if (Rows.Count > 0 && Roots.Count > 0) throw new InvalidOperationException("A collection holds rows or tree roots, not both.");
        if (Rows.Count > 100000) throw new InvalidOperationException("A collection carries at most 100,000 rows; page longer ones with Total.");
        if (_total.HasValue && _total.Value < Rows.Count) throw new InvalidOperationException("A collection's total cannot be below the rows it carries.");
        var bindings = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in Columns) bindings.Add(column.Id, column);
        CanopyGridRows.Validate(Rows, ids, bindings.Values);
        foreach (var row in Rows) foreach (var cell in row.Cells.Values) cell?.ValidateStructure(depth + 1);
        // A tree collection is inline: it has no source to load children from.
        CanopyTreeValidator.Validate(Roots, "A tree collection", node => {
            if (node.HasChildren && !node.HasInlineChildren || node.Ref != null) throw new InvalidOperationException("Node '" + node.Id + "' of a tree collection declares children that load later.");
        });
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        Validate();
        writer.BeginObject().Name("columns").BeginArray();
        foreach (var column in Columns) column.WriteJson(writer, grid: Roots.Count == 0);
        writer.EndArray();
        if (Roots.Count > 0) {
            writer.Name("roots").BeginArray();
            foreach (var root in Roots) root.WriteJson(writer);
            writer.EndArray();
        } else {
            writer.Name("rows").BeginArray();
            foreach (var row in Rows) row.WriteJson(writer);
            writer.EndArray();
        }
        writer.OptionalProperty("total", _total).OptionalProperty("pageLength", _pageLength).OptionalProperty("pageSize", _pageSize);
        if (Target != null) { writer.Name("target"); Target.WriteJson(writer); }
        writer.EndObject();
    }
}
