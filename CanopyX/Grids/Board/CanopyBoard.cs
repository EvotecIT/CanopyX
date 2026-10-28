using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A board of the grid's records, grouped by a typed column and optionally by swimlane.</summary>
/// <remarks>The grid retains its source, queries, facets, saved views and record panel. CanopyX never writes data;
/// moves propose changes to the existing grid edit contract and the host decides whether to commit them.</remarks>
public sealed class CanopyBoard {
    private string _column;
    private string? _titleColumn, _swimlaneColumn;

    /// <summary>Creates a board whose lanes come from the named column.</summary>
    /// <param name="column">The case-sensitive column id holding each record's lane value.</param>
    public CanopyBoard(string column) {
        ColumnReference(column, nameof(column));
        _column = column;
    }

    /// <summary>Gets or sets the column holding each record's raw lane identity.</summary>
    public string Column {
        get => _column;
        set { ColumnReference(value, nameof(value)); _column = value; }
    }

    /// <summary>Gets or sets the card title column; null uses the first visible column.</summary>
    public string? TitleColumn {
        get => _titleColumn;
        set { ColumnReference(value, nameof(value), allowNull: true); _titleColumn = value; }
    }

    /// <summary>Gets or sets the column grouping records into swimlanes; null keeps a single board.</summary>
    public string? SwimlaneColumn {
        get => _swimlaneColumn;
        set { ColumnReference(value, nameof(value), allowNull: true); _swimlaneColumn = value; }
    }

    /// <summary>Gets up to 200 lane labels and WIP limits in display order. Other encountered values follow in source order; an empty collection derives every lane.</summary>
    public IList<CanopyBoardLane> Lanes { get; } = new List<CanopyBoardLane>();

    /// <summary>Gets up to eight ordered column ids shown below each title. Compact browser cards show the first two and the record panel
    /// supplies the remaining fields; static output shows all configured fields. Empty uses visible columns other than lane, swimlane and title.</summary>
    public IList<string> Fields { get; } = new List<string>();

    /// <summary>Gets or sets whether readers may propose lane moves through the grid edit contract. Defaults to false;
    /// the lane column must be editable, and the grid's read-only setting still governs interaction.</summary>
    public bool Editable { get; set; }

    private static void ColumnReference(string? value, string parameter, bool allowNull = false) {
        CanopyIdentifiers.Require(value, parameter, allowNull);
        if (value != null && string.IsNullOrWhiteSpace(value)) throw new ArgumentException("A board column reference cannot be blank.", parameter);
    }

    /// <summary>Resolves configured lanes followed by other raw values in record order, retaining empty configured lanes.</summary>
    /// <param name="view">The grid whose column and labels format derived lane headings.</param>
    /// <param name="rows">The accepted records; null uses the grid's inline records. This method does not execute a query.</param>
    /// <returns>The lane definitions, including derived lanes without WIP limits.</returns>
    /// <exception cref="ArgumentNullException">The grid is null.</exception>
    /// <exception cref="InvalidOperationException">The board settings or supplied lane cells are invalid.</exception>
    public IReadOnlyList<CanopyBoardLane> GetLanes(CanopyDataGridView view, IEnumerable<CanopyGridRow>? rows = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        Validate(view);
        var column = RequireColumn(view, Column, "column");
        var result = new List<CanopyBoardLane>(Lanes);
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var lane in result) keys.Add(CanopyGridFacets.Key(lane.Value?.Value, exactTokens: true));
        foreach (var row in rows ?? view.Rows) {
            if (row == null) throw new InvalidOperationException("A board cannot contain a null record.");
            row.Cells.TryGetValue(Column, out var cell);
            var value = CanopyGridValues.Normalize(cell?.Value);
            CanopyGridValues.Validate(value, column);
            if (!keys.Add(CanopyGridFacets.Key(value, exactTokens: true))) continue;
            var label = value == null ? view.Labels.BoardUnassigned : cell!.DisplayText(column, view.Labels);
            if (string.IsNullOrWhiteSpace(label)) label = view.Labels.BoardUnassigned;
            result.Add(new CanopyBoardLane(value == null ? null : cell, label));
        }
        return result.AsReadOnly();
    }

    internal void Validate(CanopyDataGridView view) {
        if (view.Navigation == CanopyGridNavigation.Cursor || view.Presentation == CanopyGridPresentation.Paged)
            throw new InvalidOperationException("A board requires continuous offset records, not cursor or paged presentation.");
        if (view.Calendar != null) throw new InvalidOperationException("A grid cannot show a board and calendar together.");
        if (Lanes.Count > 200) throw new InvalidOperationException("A board has at most 200 configured lanes.");
        if (Fields.Count > 8) throw new InvalidOperationException("A board has at most eight card fields.");
        var column = RequireColumn(view, Column, "column");
        if (TitleColumn != null) RequireColumn(view, TitleColumn, "titleColumn");
        if (SwimlaneColumn != null) RequireColumn(view, SwimlaneColumn, "swimlaneColumn");
        var fields = new HashSet<string>(StringComparer.Ordinal);
        foreach (var field in Fields) {
            if (string.IsNullOrWhiteSpace(field) || !fields.Add(field)) throw new InvalidOperationException("Board fields must be nonempty, distinct column ids.");
            RequireColumn(view, field, "fields");
        }
        var identities = new HashSet<string>(StringComparer.Ordinal);
        foreach (var lane in Lanes) {
            if (lane == null) throw new InvalidOperationException("A board cannot contain a null lane.");
            var value = lane.Value?.Value;
            if (value is double number && (double.IsNaN(number) || double.IsInfinity(number)))
                throw new InvalidOperationException("A board lane identity must be finite; use null for an empty lane.");
            CanopyGridValues.Validate(value, column);
            lane.Value?.WriteValue(CanopyJsonWriter.Discarding());
            if (!identities.Add(CanopyGridFacets.Key(value, exactTokens: true)))
                throw new InvalidOperationException("Board lane identities must be distinct raw typed values.");
        }
        if (Editable && !column.Editable) throw new InvalidOperationException("Board moves require an editable lane column.");
        if (Editable && view.RowIdentity != CanopyGridRowIdentity.StableKey) throw new InvalidOperationException("Board moves require stable record keys.");
    }

    private static CanopyColumn RequireColumn(CanopyDataGridView view, string id, string setting) {
        foreach (var column in view.Columns) if (column != null && column.Id == id) return column;
        throw new InvalidOperationException("Board " + setting + " refers to undeclared column '" + id + "'.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("column", Column).OptionalProperty("titleColumn", TitleColumn)
            .OptionalProperty("swimlaneColumn", SwimlaneColumn).Name("lanes").BeginArray();
        foreach (var lane in Lanes) lane.WriteJson(writer);
        writer.EndArray();
        if (Fields.Count > 0) {
            writer.Name("fields").BeginArray();
            foreach (var field in Fields) writer.String(field);
            writer.EndArray();
        }
        if (Editable) writer.Property("editable", true);
        writer.EndObject();
    }
}
