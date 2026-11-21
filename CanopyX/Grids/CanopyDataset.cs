using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One set of rows that several views on a page read by reference: flat grids, pivots and record panels name it with
/// <see cref="CanopyGridSource.FromDataset"/> instead of each carrying its own rows. The page carries the rows once, the browser
/// reads, decodes and validates them once, and every view keeps the same row objects. See docs/datasets.md.
/// </summary>
/// <remarks>
/// <para>
/// An inline dataset carries its rows (<see cref="Rows"/>); an address dataset (<see cref="FromUrl"/>) reads them once from a
/// JSON address and again every <see cref="Refresh"/>; a hosted dataset (<see cref="Hosted"/>) shares the host source the page
/// registers with <c>CanopyX.defineDataset</c>, and each view still asks its own queries. Views read the rows and never change
/// them: a change goes through the dataset (<c>CanopyX.dataset(id).setRows</c>), and every view runs its query again.
/// </para>
/// <para>
/// <see cref="Columns"/> declares each cell's id and kind; the rows are validated against them once. A view may show any of
/// the columns, with the same kind, and its own titles, formats, presenters and widths.
/// </para>
/// </remarks>
public sealed class CanopyDataset {
    private CanopyDataset(string id, CanopyGridSourceKind kind) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Kind = kind;
    }

    /// <summary>Gets the page-unique dataset id the views name.</summary>
    public string Id { get; }

    /// <summary>Gets whether the rows are on the page (<see cref="CanopyGridSourceKind.Inline"/>, also for an address) or behind a host source.</summary>
    public CanopyGridSourceKind Kind { get; }

    /// <summary>Gets the address the rows are read from, or null when the dataset carries them or is hosted.</summary>
    public string? Url { get; private set; }

    /// <summary>Gets how often the rows at <see cref="Url"/> are read again, or null to read them once.</summary>
    public TimeSpan? Refresh { get; private set; }

    /// <summary>Gets the columns of the rows: each one's id and <see cref="CanopyColumn.Kind"/>. Titles and presentation belong to the views.</summary>
    public IList<CanopyColumn> Columns { get; } = new List<CanopyColumn>();

    /// <summary>Gets the rows of an inline dataset. Address and hosted datasets carry none.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Creates a dataset that carries its rows.</summary>
    /// <param name="id">The page-unique id.</param>
    /// <returns>An inline dataset; add its <see cref="Columns"/> and <see cref="Rows"/>.</returns>
    public static CanopyDataset Inline(string id) => new(id, CanopyGridSourceKind.Inline);

    /// <summary>
    /// Creates a dataset whose rows the page reads from a JSON address (an array of rows, or an object with a <c>rows</c>
    /// array), once for every view, and again every <paramref name="refresh"/> while the page is visible.
    /// </summary>
    /// <param name="id">The page-unique id.</param>
    /// <param name="url">An http(s) or relative address of at most 2,048 characters.</param>
    /// <param name="refresh">How often to read the rows again, from 5 seconds to a day; null reads them once.</param>
    /// <returns>An address dataset; add its <see cref="Columns"/>.</returns>
    public static CanopyDataset FromUrl(string id, string url, TimeSpan? refresh = null) {
        var source = CanopyGridSource.FromUrl(url, refresh);
        return new CanopyDataset(id, CanopyGridSourceKind.Inline) { Url = source.Url, Refresh = source.Refresh };
    }

    /// <summary>Creates a dataset served by a host source the page registers once with <c>CanopyX.defineDataset</c>.</summary>
    /// <param name="id">The page-unique id.</param>
    /// <returns>A hosted dataset. Its <see cref="Columns"/> are optional and checked against the views when given.</returns>
    public static CanopyDataset Hosted(string id) => new(id, CanopyGridSourceKind.Host);

    /// <summary>Checks the columns and rows.</summary>
    /// <exception cref="InvalidOperationException">An inline dataset has no columns, a column is repeated or null, the rows do not fit the columns, or an address or hosted dataset carries rows.</exception>
    public void Validate() {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in Columns) {
            if (column == null || !ids.Add(column.Id)) throw new InvalidOperationException("Dataset columns must be unique and not null.");
            if (!Enum.IsDefined(typeof(CanopyColumnKind), column.Kind)) throw new InvalidOperationException("Dataset column '" + column.Id + "' has an unknown kind.");
        }
        if (Kind == CanopyGridSourceKind.Inline && Columns.Count == 0) throw new InvalidOperationException("A dataset with rows declares its columns.");
        if ((Kind != CanopyGridSourceKind.Inline || Url != null) && Rows.Count != 0) throw new InvalidOperationException("An address or hosted dataset carries no rows of its own.");
        CanopyGridRows.Validate(Rows, ids, Columns);
    }

    /// <summary>Checks that a view can read this dataset: it names it, and each of its columns is a dataset column of the same kind.</summary>
    /// <param name="view">The view.</param>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view names another source, or a column is missing from the dataset or has another kind.</exception>
    public void ValidateView(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (view.Source.Dataset != Id || view.Source.Kind != Kind) throw new InvalidOperationException("View '" + view.Id + "' does not read dataset '" + Id + "'.");
        if (Kind == CanopyGridSourceKind.Host && Columns.Count == 0) return;
        var kinds = Columns.ToDictionary(column => column.Id, column => column.Kind, StringComparer.Ordinal);
        foreach (var column in view.Columns) {
            if (!kinds.TryGetValue(column.Id, out var kind)) throw new InvalidOperationException("Column '" + column.Id + "' of view '" + view.Id + "' is not in dataset '" + Id + "'.");
            if (kind != column.Kind) throw new InvalidOperationException("Column '" + column.Id + "' of view '" + view.Id + "' has another kind than in dataset '" + Id + "'.");
        }
    }

    /// <summary>Writes the HTML-safe <c>dataset</c> document of the <c>canopyx/2</c> protocol with the rows as row objects.</summary>
    /// <returns>The dataset document.</returns>
    public string ToJson() => WriteJson(null);

    /// <summary>
    /// Takes the rows as compact row data: the dataset document then carries its descriptor (<see cref="ToJson(CanopyGridRowData)"/>)
    /// and each chunk travels in an <c>application/x-canopyx-rows</c> script inside the dataset element.
    /// </summary>
    /// <param name="options">Chunk size and format; null for the defaults.</param>
    /// <returns>The compact rows.</returns>
    /// <exception cref="InvalidOperationException">The dataset is not inline with rows, or a row carries a detail payload or record fields.</exception>
    public CanopyGridRowData ToRowData(CanopyRowDataOptions? options = null) {
        if (Kind != CanopyGridSourceKind.Inline || Url != null) throw new InvalidOperationException("Only a dataset that carries its rows has row data.");
        Validate();
        var view = new CanopyDataGridView(Id, Id);
        foreach (var column in Columns) view.Columns.Add(new CanopyColumn(column.Id, column.Id) { Kind = column.Kind });
        foreach (var row in Rows) view.Rows.Add(row);
        return new CanopyGridRowData(view, options);
    }

    /// <summary>Writes the HTML-safe <c>dataset</c> document with compact row data in place of the rows.</summary>
    /// <param name="rowData">The row data from <see cref="ToRowData"/>.</param>
    /// <returns>The dataset document.</returns>
    /// <exception cref="ArgumentException"><paramref name="rowData"/> belongs to another dataset or its columns changed.</exception>
    public string ToJson(CanopyGridRowData rowData) {
        if (rowData == null) throw new ArgumentNullException(nameof(rowData));
        if (rowData.View.Id != Id || !rowData.Columns.SequenceEqual(Columns.Select(column => column.Id))) throw new ArgumentException("The row data belongs to another dataset or its columns changed.", nameof(rowData));
        return WriteJson(rowData);
    }

    private string WriteJson(CanopyGridRowData? rowData) {
        Validate();
        var writer = new CanopyJsonWriter(rowData == null ? 1024 + Rows.Count * 96 : 1024);
        writer.BeginObject().Envelope("dataset").Property("id", Id);
        if (Kind == CanopyGridSourceKind.Host) writer.Property("kind", "host");
        writer.Name("columns").BeginArray();
        foreach (var column in Columns) {
            writer.BeginObject().Property("id", column.Id)
                .Property("kind", column.Kind == CanopyColumnKind.Number ? "number" : column.Kind == CanopyColumnKind.DateTime ? "datetime" : "text").EndObject();
        }
        writer.EndArray();
        if (Url != null) {
            writer.Property("url", Url);
            if (Refresh.HasValue) writer.Property("refreshSeconds", Refresh.Value.Ticks / TimeSpan.TicksPerSecond);
        } else if (rowData != null) {
            writer.Name("rowData");
            rowData.WriteDescriptor(writer, null);
        } else if (Kind == CanopyGridSourceKind.Inline) {
            writer.Name("rows").BeginArray();
            foreach (var row in Rows) row.WriteJson(writer);
            writer.EndArray();
        }
        return writer.EndObject().ToString();
    }
}
