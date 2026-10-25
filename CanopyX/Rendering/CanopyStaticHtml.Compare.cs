using System;
using System.Globalization;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders comparison counts and the existing grid fallback as script-free, inline-styled email or print HTML.</summary>
    /// <param name="view">An inline comparison view, normally created by <see cref="CanopyDatasetComparison.ToView"/>.</param>
    /// <param name="options">Existing grid row limit, caption, culture, theme and full-report link.</param>
    /// <returns>The complete comparison summary and the grid's table, including before/after values and textual row statuses.</returns>
    /// <remarks>Counts describe the complete comparison, even when the row limit or initial changes-only display hides rows.
    /// No queries, scripts, event handlers, stylesheets or external resources are required.</remarks>
    /// <exception cref="ArgumentNullException">The view is null.</exception>
    /// <exception cref="InvalidOperationException">The view has no comparison metadata or is not an inline grid.</exception>
    public static string RenderComparison(CanopyDataGridView view, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        var info = view.Compare ?? throw new InvalidOperationException("A comparison fallback requires comparison metadata.");
        view.Validate();
        if (view.Source.Kind != CanopyGridSourceKind.Inline) throw new InvalidOperationException("A comparison fallback requires a complete inline snapshot.");
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = view.Labels;
        var html = new StringBuilder();
        html.Append("<div style=\"").Append(styles.Note).Append("\">").Append(Encode(labels.CompareSummary)).Append(": ");
        var counts = info.Counts;
        var names = new[] { labels.CompareAdded, labels.CompareRemoved, labels.CompareChanged, labels.CompareUnchanged };
        var values = new[] { counts.Added, counts.Removed, counts.Changed, counts.Unchanged };
        for (var index = 0; index < names.Length; index++) {
            if (index > 0) html.Append(" · ");
            html.Append(Encode(names[index])).Append(": ").Append(values[index].ToString("N0", settings.Culture));
        }
        html.Append("</div><div style=\"").Append(styles.Note).Append("\">");
        var first = true;
        foreach (var column in view.Columns) {
            if (!info.Columns.TryGetValue(column.Id, out var count)) continue;
            if (!first) html.Append(" · ");
            first = false;
            html.Append(Encode(labels.CompareColumnChanges.Replace("{column}", column.Title)
                .Replace("{count}", count.ToString("N0", settings.Culture))));
        }
        html.Append("</div>");
        if (!info.OnlyChanges) return html.Append(RenderGrid(view, options: settings)).ToString();
        var rows = new System.Collections.Generic.List<CanopyGridRow>();
        foreach (var row in view.Rows) if (!row.Cells.TryGetValue(info.StatusColumn, out var status) || !Equals(status?.Value, "unchanged")) rows.Add(row);
        return html.Append(RenderGridRows(view, rows, rows.Count, 0, settings).Html).ToString();
    }

    private static string ComparisonStatusText(CanopyDatasetCompareInfo info, CanopyColumn column, CanopyCell? cell, CanopyLabels labels) {
        if (column.Id != info.StatusColumn) return cell?.DisplayText(column, labels) ?? string.Empty;
        return cell?.Value switch {
            "added" => labels.CompareAdded, "removed" => labels.CompareRemoved,
            "changed" => labels.CompareChanged, "unchanged" => labels.CompareUnchanged,
            _ => cell?.DisplayText(column, labels) ?? string.Empty
        };
    }

    private static string ComparisonHeaderText(CanopyDataGridView view, CanopyColumn column) =>
        view.Compare != null && view.Compare.Columns.TryGetValue(column.Id, out var count)
            ? view.Labels.CompareColumnChanges.Replace("{column}", column.Title).Replace("{count}", count.ToString(CultureInfo.InvariantCulture))
            : column.Title;

    private static string BeforeAfterText(CanopyFieldChange change, CanopyColumn column, CanopyLabels labels) =>
        labels.RecordBefore + ": " + ComparisonValueText(change.Before, column, labels) + " → " +
        labels.RecordAfter + ": " + ComparisonValueText(change.After, column, labels);

    private static string ComparisonValueText(CanopyCell? cell, CanopyColumn column, CanopyLabels labels) {
        if (cell == null) return "—";
        if (cell.Value == null && !cell.IsStructured && string.IsNullOrEmpty(cell.Text)) return "null";
        // Keep ordinary formatting (including custom number formats) and the source display text.
        var text = cell.DisplayText(column, labels);
        if (!cell.IsStructured) return text.Length == 0 ? "\"\"" : text;
        if (cell.Items.Count > 0) return string.Join(", ", System.Linq.Enumerable.Select(cell.Items, item => ComparisonValueText(item, column, labels)));
        if (cell.Fields.Count > 0) return string.Join("; ", System.Linq.Enumerable.Select(cell.Fields, field => field.Name + ": " + ComparisonValueText(field.Value, column, labels)));
        if (cell.Changes.Count > 0) return string.Join("; ", System.Linq.Enumerable.Select(cell.Changes, item => item.Name + ": " + BeforeAfterText(item, column, labels)));
        if (text.Length > 0) return text;
        if (cell.Records != null) return (cell.Records.Total ?? cell.Records.Rows.Count + cell.Records.Roots.Count).ToString(CultureInfo.InvariantCulture);
        return cell.Events.Count.ToString(CultureInfo.InvariantCulture);
    }
}
