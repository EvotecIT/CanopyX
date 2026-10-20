using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A status matrix: two axes of entities (domain controllers by domain controllers, services by servers, policies by
/// domain controllers) and a state for each pair, drawn by the browser's matrix part with sticky headers, both axes
/// windowed, sorting, filtering and grouping on either axis, totals, a legend and keyboard navigation (see docs/matrix.md).
/// </summary>
/// <remarks>
/// <para>
/// Declare the <see cref="States"/> (worst first, each with a tone and a symbol), the <see cref="Rows"/> and
/// <see cref="Columns"/> (or set <see cref="Square"/> so the rows are also the columns), then the <see cref="Cells"/>. A pair
/// without a cell has no data. The document is checked when it is written (<see cref="Validate"/>, <see cref="ToJson"/> and
/// the HTML writers); <see cref="FromJson"/> reads one back with the same checks.
/// </para>
/// <para>CanopyX never writes: clicking a cell raises <c>canopyx:matrixCell</c> for the host.</para>
/// </remarks>
public sealed partial class CanopyMatrix {
    /// <summary>The <see cref="CanopyMatrixAxis.SortBy"/> value that sorts an axis by its labels.</summary>
    public const string SortByLabel = "#label";

    /// <summary>The <see cref="CanopyMatrixAxis.SortBy"/> value that sorts an axis by its totals, largest first when descending.</summary>
    public const string SortByTotal = "#total";

    /// <summary>The most items an axis holds.</summary>
    public const int MaxItems = 10000;

    /// <summary>The most cells (rows times columns) a matrix holds.</summary>
    public const int MaxCells = 1000000;

    /// <summary>The most states a matrix declares.</summary>
    public const int MaxStates = 36;

    /// <summary>Creates a matrix.</summary>
    /// <param name="id">The matrix's identity; a nonempty identifier of at most 256 characters.</param>
    /// <param name="label">Its accessible name, such as "Inbound replication": plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty or too long.</exception>
    public CanopyMatrix(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the matrix's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the accessible name. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets the row axis.</summary>
    public CanopyMatrixAxis Rows { get; } = new CanopyMatrixAxis();

    /// <summary>Gets the column axis. When <see cref="Square"/> is set only its <see cref="CanopyMatrixAxis.Title"/> applies (such as "Source" beside the rows' "Destination").</summary>
    public CanopyMatrixAxis Columns { get; } = new CanopyMatrixAxis();

    /// <summary>Gets or sets whether the rows are also the columns (a domain controller by domain controller matrix).</summary>
    public bool Square { get; set; }

    /// <summary>Gets or sets what the self cells of a square matrix show.</summary>
    public CanopyMatrixDiagonal Diagonal { get; set; }

    /// <summary>Gets the states, worst first: 1 to 36.</summary>
    public IList<CanopyMatrixState> States { get; } = new List<CanopyMatrixState>();

    /// <summary>Gets the cells; a row and column pair has at most one.</summary>
    public IList<CanopyMatrixCell> Cells { get; } = new List<CanopyMatrixCell>();

    /// <summary>Gets the ids of the states the row and column totals count; empty counts the states marked <see cref="CanopyMatrixState.Attention"/>.</summary>
    public IList<string> TotalStates { get; } = new List<string>();

    /// <summary>Gets or sets whether a total column follows the cells of each row.</summary>
    public bool RowTotals { get; set; } = true;

    /// <summary>Gets or sets whether a total row follows the rows.</summary>
    public bool ColumnTotals { get; set; } = true;

    /// <summary>Gets or sets whether the matrix opens showing only the rows and columns with cells that need attention.</summary>
    public bool AttentionOnly { get; set; }

    /// <summary>Gets or sets the width of a cell in pixels, 24 to 120; null for 32 (wide enough for a symbol and two digits).</summary>
    public int? CellWidth { get; set; }

    /// <summary>Gets or sets the spacing, as the grid densities; null for normal.</summary>
    public CanopyGridDensity? Density { get; set; }

    /// <summary>Gets or sets what clicking a cell does after the host's event.</summary>
    public CanopyMatrixDetails Details { get; set; }

    /// <summary>Gets or sets how the matrix reads on a phone.</summary>
    public CanopyMatrixPhoneLayout Phone { get; set; }

    /// <summary>Gets or sets whether the legend of states and their counts shows above the cells.</summary>
    public bool Legend { get; set; } = true;

    /// <summary>Gets or sets the translations of the texts the matrix writes itself; the document carries those that differ from English.</summary>
    public CanopyLabels? Labels { get; set; }

    /// <summary>Adds a state and returns the matrix, for chaining. Add states worst first.</summary>
    /// <param name="id">The state id.</param>
    /// <param name="label">The label.</param>
    /// <param name="tone">The tone.</param>
    /// <param name="symbol">The symbol.</param>
    /// <param name="attention">Whether cells in this state need attention.</param>
    /// <returns>The matrix.</returns>
    public CanopyMatrix State(string id, string label, CanopyTone tone, CanopyMatrixSymbol symbol, bool attention = false) {
        States.Add(new CanopyMatrixState(id, label, tone, symbol) { Attention = attention });
        return this;
    }

    /// <summary>Sets the state of a row and column and returns the cell, for its value, text and details.</summary>
    /// <param name="row">The row item's id.</param>
    /// <param name="column">The column item's id.</param>
    /// <param name="state">The state's id.</param>
    /// <returns>The cell.</returns>
    public CanopyMatrixCell Set(string row, string column, string state) {
        var cell = new CanopyMatrixCell(row, column, state);
        Cells.Add(cell);
        return cell;
    }

    /// <summary>Adds a cell per record and returns the matrix, for chaining.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="records">The records.</param>
    /// <param name="row">Returns a record's row item id.</param>
    /// <param name="column">Returns a record's column item id.</param>
    /// <param name="state">Returns a record's state id.</param>
    /// <param name="configure">Sets a cell's value, text, title or details from its record, or null.</param>
    /// <returns>The matrix.</returns>
    /// <exception cref="ArgumentNullException">An argument other than <paramref name="configure"/> is null.</exception>
    public CanopyMatrix AddCells<T>(IEnumerable<T> records, Func<T, string> row, Func<T, string> column, Func<T, string> state, Action<T, CanopyMatrixCell>? configure = null) {
        if (records == null) throw new ArgumentNullException(nameof(records));
        if (row == null) throw new ArgumentNullException(nameof(row));
        if (column == null) throw new ArgumentNullException(nameof(column));
        if (state == null) throw new ArgumentNullException(nameof(state));
        foreach (var record in records) {
            var cell = Set(row(record), column(record), state(record));
            configure?.Invoke(record, cell);
        }

        return this;
    }

    /// <summary>Checks the whole matrix as the writers do.</summary>
    /// <exception cref="InvalidOperationException">The matrix is not valid; the message names the first problem.</exception>
    public void Validate() => CanopyMatrixValidator.Validate(this);
}
