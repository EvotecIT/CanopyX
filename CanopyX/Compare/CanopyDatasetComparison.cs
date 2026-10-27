using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace CanopyX;

/// <summary>A complete keyed comparison with source rows, deterministic ordering and unfiltered counts.</summary>
public sealed class CanopyDatasetComparison {
    internal CanopyDatasetComparison(List<CanopyComparedRow> rows, List<string> columns, string statusColumn,
        CanopyDatasetCompareCounts counts, Dictionary<string, int> columnChanges) {
        Rows = rows.AsReadOnly(); Columns = columns.AsReadOnly(); StatusColumn = statusColumn;
        Counts = counts; ColumnChanges = new ReadOnlyDictionary<string, int>(columnChanges);
    }

    /// <summary>Gets earlier rows in source order, followed by added rows in later source order.</summary>
    public IReadOnlyList<CanopyComparedRow> Rows { get; }
    /// <summary>Gets compared column IDs in explicit or first-seen order.</summary>
    public IReadOnlyList<string> Columns { get; }
    /// <summary>Gets the generated status ID: change, change_1, and so on, avoiding all source cell IDs.</summary>
    public string StatusColumn { get; }
    /// <summary>Gets complete row counts, before display filtering.</summary>
    public CanopyDatasetCompareCounts Counts { get; }
    /// <summary>Gets the number of matched rows with a changed value for each compared column.</summary>
    public IReadOnlyDictionary<string, int> ColumnChanges { get; }

    /// <summary>Maps the comparison into an inline, read-only grid using the existing before/after change presenter.</summary>
    /// <param name="id">The grid identity.</param>
    /// <param name="label">The grid's accessible name.</param>
    /// <param name="columns">Definitions of the compared columns, in display order. All compared IDs must be declared.</param>
    /// <param name="onlyChanges">Whether the initial display hides unchanged rows; all rows and complete counts remain available.</param>
    /// <param name="statusTitle">The status-column heading.</param>
    /// <returns>A new view with copied read-only column definitions and comparison metadata.</returns>
    /// <remarks>
    /// The output's raw cells are later-version values, so typed queries retain their normal meaning. Removed rows have
    /// null raw values and retain earlier typed values in their structured before/after payload. Later values must satisfy
    /// the supplied column kinds. Changed-cell payloads retain source values by reference; do not mutate the source rows.
    /// Supplied column definitions are copied. Display labels, sizing and numeric formats are retained; editing and custom
    /// renderers are deliberately omitted. Initial filtering is metadata, so the browser can reveal unchanged rows again.
    /// </remarks>
    /// <exception cref="ArgumentNullException">The columns are null.</exception>
    /// <exception cref="ArgumentException">Columns are duplicated, omit a compared ID or collide with the status ID.</exception>
    /// <exception cref="InvalidOperationException">The resulting view violates a grid contract, including later-value types.</exception>
    public CanopyDataGridView ToView(string id, string label, IEnumerable<CanopyColumn> columns,
        bool onlyChanges = false, string statusTitle = "Change") {
        if (columns == null) throw new ArgumentNullException(nameof(columns));
        var definitions = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        var view = new CanopyDataGridView(id, label);
        view.Columns.Add(new CanopyColumn(StatusColumn, statusTitle) { Sortable = true, AlwaysVisible = true });
        foreach (var column in columns) {
            if (column == null || column.Id == StatusColumn || definitions.ContainsKey(column.Id))
                throw new ArgumentException("Comparison definitions need unique data column IDs distinct from the status column.", nameof(columns));
            definitions.Add(column.Id, column);
            view.Columns.Add(CopyColumn(column));
            if (column.Ordering != null) view.Reporting = new CanopyGridReporting();
        }
        foreach (var column in Columns) if (!definitions.ContainsKey(column))
            throw new ArgumentException("Missing comparison column definition: " + column, nameof(columns));
        view.Compare = new CanopyDatasetCompareInfo(StatusColumn, Counts, ColumnChanges, onlyChanges);
        foreach (var compared in Rows) {
            var row = new CanopyGridRow(compared.Id);
            row.Cells.Add(StatusColumn, new CanopyCell(StatusToken(compared.Status)));
            var changed = new HashSet<string>(compared.ChangedColumns, StringComparer.Ordinal);
            foreach (var column in view.Columns.Skip(1)) {
                CanopyCell? before = null, after = null;
                var had = compared.Before != null && compared.Before.Cells.TryGetValue(column.Id, out before);
                var has = compared.After != null && compared.After.Cells.TryGetValue(column.Id, out after);
                if (changed.Contains(column.Id) || compared.Status == CanopyDatasetRowStatus.Removed && had) {
                    var cell = CanopyCompareCells.Scalar(after);
                    // Text on the wrapper would suppress the before/after presenter in some hosts.
                    cell.Text = null;
                    cell.Changes.Add(new CanopyFieldChange(column.Title,
                        had ? CanopyCompareCells.Present(before) : null, has ? CanopyCompareCells.Present(after) : null) { Kind = column.Kind });
                    row.Cells.Add(column.Id, cell);
                } else if (has) row.Cells.Add(column.Id, after!);
            }
            view.Rows.Add(row);
        }
        view.Validate();
        return view;
    }

    internal static string StatusToken(CanopyDatasetRowStatus status) => status switch {
        CanopyDatasetRowStatus.Added => "added", CanopyDatasetRowStatus.Removed => "removed",
        CanopyDatasetRowStatus.Changed => "changed", _ => "unchanged"
    };

    private static CanopyColumn CopyColumn(CanopyColumn source) {
        var column = new CanopyColumn(source.Id, source.Title) {
            Kind = source.Kind, HeaderDescription = source.HeaderDescription, Sizing = source.Sizing,
            Sortable = source.Sortable, Filterable = source.Filterable, Exportable = source.Exportable,
            Hidden = source.Hidden, Wrap = source.Wrap, MaxLines = source.MaxLines, Format = source.Format,
            Aggregatable = source.Aggregatable, Section = source.Section, ShowInDrawer = source.ShowInDrawer,
            ResponsivePriority = source.ResponsivePriority, AlwaysVisible = source.AlwaysVisible,
            Pinned = source.Pinned, RowHeader = source.RowHeader, Tooltip = source.Tooltip, Ordering = source.Ordering,
            Presenter = CanopyGridPresenter.BeforeAfter()
        };
        foreach (var item in source.ValueLabels) column.ValueLabels.Add(item.Key, item.Value);
        foreach (var item in source.ValueOrder) column.ValueOrder.Add(item);
        foreach (var item in source.ValueTones) column.ValueTones.Add(item.Key, item.Value);
        foreach (var item in source.NumericTones) column.NumericTones.Add(item);
        return column;
    }
}
