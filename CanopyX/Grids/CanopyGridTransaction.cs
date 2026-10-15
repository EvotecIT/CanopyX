using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Changes to a flat grid's rows that a host sends to the browser while the page is open (a <c>gridTransaction</c> document): rows to
/// add, rows to update and the identities of rows to remove. The browser's <c>applyTransaction</c> applies it in place.
/// </summary>
/// <remarks>
/// <para><see cref="Add"/> holds complete rows; a row whose identity the grid already has replaces that row. <see cref="Update"/>
/// holds rows whose cells are merged into the existing row's: a cell set to null clears that cell, a cell left out keeps its value,
/// and a set tone, class or record field replaces the row's. <see cref="Remove"/> lists identities. Removes apply first, then
/// adds, then updates. An update or removal of a row the grid does not have is skipped and reported as missing.</para>
/// <para>Hosted grids take updates of the rows they have loaded; rows are added to and removed from a hosted grid at its source,
/// which then answers a newer revision to <c>refreshRows</c>.</para>
/// </remarks>
public sealed class CanopyGridTransaction {
    /// <summary>Gets the complete rows to add, or to put in place of rows with the same identity.</summary>
    public IList<CanopyGridRow> Add { get; } = new List<CanopyGridRow>();

    /// <summary>Gets the rows whose cells are merged into the existing rows; a null cell clears that cell.</summary>
    public IList<CanopyGridRow> Update { get; } = new List<CanopyGridRow>();

    /// <summary>Gets the identities of the rows to remove.</summary>
    public IList<string> Remove { get; } = new List<string>();

    /// <summary>Writes the HTML-safe <c>gridTransaction</c> document, checked against the grid's columns.</summary>
    /// <param name="view">The grid the changes are for.</param>
    /// <returns>The document.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">A row names an undeclared column, holds an invalid value, repeats an identity
    /// within its list, or the transaction changes more than 100,000 rows.</exception>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        var columnIds = view.ValidateColumns();
        if (Add.Count + Update.Count + Remove.Count > 100000) throw new InvalidOperationException("A transaction changes at most 100,000 rows.");
        CanopyGridRows.Validate(Add, columnIds, view.Columns);
        CanopyGridRows.Validate(Update, columnIds, view.Columns);
        foreach (var id in Remove) CanopyIdentifiers.Require(id, nameof(Remove));
        var writer = new CanopyJsonWriter(1024);
        writer.BeginObject().Envelope("gridTransaction").Property("view", view.Id);
        WriteRows(writer, "add", Add);
        WriteRows(writer, "update", Update);
        if (Remove.Count > 0) {
            writer.Name("remove").BeginArray();
            foreach (var id in Remove) writer.String(id);
            writer.EndArray();
        }
        return writer.EndObject().ToString();
    }

    private static void WriteRows(CanopyJsonWriter writer, string name, IList<CanopyGridRow> rows) {
        if (rows.Count == 0) return;
        writer.Name(name).BeginArray();
        foreach (var row in rows) row.WriteJson(writer);
        writer.EndArray();
    }
}
