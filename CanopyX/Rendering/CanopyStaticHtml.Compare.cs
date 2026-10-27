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
        var caption = settings.Caption ?? view.Label;
        if (caption.Length != 0) html.Append("<h2 style=\"").Append(styles.ComparisonHeading).Append("margin:0;\">").Append(Encode(caption)).Append("</h2>");
        html.Append("<div role=\"group\" aria-label=\"").Append(Encode(labels.CompareSummary)).Append("\" style=\"").Append(styles.Note).Append("\">");
        var counts = info.Counts;
        var names = new[] { labels.CompareAdded, labels.CompareRemoved, labels.CompareChanged, labels.CompareUnchanged };
        var values = new[] { counts.Added, counts.Removed, counts.Changed, counts.Unchanged };
        var firstCount = true;
        for (var index = 0; index < names.Length; index++) {
            if (values[index] == 0) continue;
            if (!firstCount) html.Append(" · ");
            firstCount = false;
            html.Append("<span style=\"white-space:nowrap;\">").Append(values[index].ToString("N0", settings.Culture)).Append(" ").Append(Encode(names[index])).Append("</span>");
        }
        if (firstCount) html.Append(Encode(labels.GridNoData));
        html.Append("</div>");
        var first = true;
        foreach (var column in view.Columns) {
            if (!info.Columns.TryGetValue(column.Id, out var count) || count == 0) continue;
            if (first) html.Append("<div style=\"").Append(styles.Note).Append("\">");
            else html.Append(" · ");
            first = false;
            html.Append("<span style=\"white-space:nowrap;\">").Append(Encode(CanopyPlural.Pick(labels.CompareColumnChanges, count, settings.Culture).Replace("{column}", column.Title)
                .Replace("{count}", count.ToString("N0", settings.Culture)))).Append("</span>");
        }
        if (!first) html.Append("</div>");
        if (!info.OnlyChanges) return html.Append(RenderGridRows(view, view.Rows, view.Rows.Count, 0, settings, includeCaption: false).Html).ToString();
        var rows = new System.Collections.Generic.List<CanopyGridRow>();
        foreach (var row in view.Rows) if (!row.Cells.TryGetValue(info.StatusColumn, out var status) || !Equals(status?.Value, "unchanged")) rows.Add(row);
        return html.Append(RenderGridRows(view, rows, rows.Count, 0, settings, includeCaption: false).Html).ToString();
    }

    private static string ComparisonStatusText(CanopyDatasetCompareInfo info, CanopyColumn column, CanopyCell? cell, CanopyLabels labels) {
        if (column.Id != info.StatusColumn) return cell?.DisplayText(column, labels) ?? string.Empty;
        return cell?.Value switch {
            "added" => labels.CompareAdded, "removed" => labels.CompareRemoved,
            "changed" => labels.CompareChanged, "unchanged" => labels.CompareUnchanged,
            _ => cell?.DisplayText(column, labels) ?? string.Empty
        };
    }

    // Only compared cells use this compact HTML; captures retain the same complete plain-text values.
    private static bool AppendComparisonCell(StringBuilder html, StringBuilder text, CanopyDataGridView view,
        CanopyGridRow row, CanopyColumn column, CanopyCell? cell) {
        if (view.Compare == null || column.Presenter?.BeforeAfterValues != true || cell?.Changes.Count == 0 || cell == null) return false;
        if (row.Cells.TryGetValue(view.Compare.StatusColumn, out var status) && Equals(status.Value, "removed")) return false;
        var first = true;
        foreach (var change in cell.Changes) {
            if (!first) { html.Append("; "); text.Append("; "); }
            first = false;
            var before = ComparisonValueText(change.Before, column, view.Labels);
            var after = ComparisonValueText(change.After, column, view.Labels);
            html.Append(column.Kind == CanopyColumnKind.Number ? "<span style=\"white-space:nowrap;\"><del>" : "<span><del>").Append(Encode(before))
                .Append("</del> → <ins style=\"text-decoration:none;\">").Append(Encode(after)).Append("</ins></span>");
            text.Append(before).Append(" → ").Append(after);
        }
        return true;
    }

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
