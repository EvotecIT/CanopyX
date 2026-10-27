using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders a computed pivot as a script-free, inline-styled table with hierarchical rows and exact totals.</summary>
    /// <param name="view">The reporting view that owns the pivot's columns and aggregates.</param>
    /// <param name="result">The complete computed pivot, before presentation limits.</param>
    /// <param name="options">Optional theme, culture, caption and outline limits. Totals always cover the complete result.</param>
    /// <returns>A natural-width table suitable for print, email and document hosts.</returns>
    public static string RenderGridPivot(CanopyDataGridView view, CanopyPivotResult result, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (result == null) throw new ArgumentNullException(nameof(result));
        if (result.View != view.Id) throw new ArgumentException("The pivot belongs to another view.", nameof(result));
        view.Validate();
        var definition = result.Definition;
        definition.Validate(view);
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var aggregates = definition.Values.Select(id => view.Reporting!.Aggregates.First(value => value.Id == id)).ToArray();
        var totalRow = result.Rows.First(node => node.Parent == null);
        var totalColumn = result.Columns.First(node => node.Parent == null);
        // Prefix columns expose subtotals; complete paths keep repeated inner captions unambiguous.
        var columns = result.Columns.Where(node => node.Parent != null).Concat(new[] { totalColumn }).ToArray();
        var html = new StringBuilder();
        var width = 1 + columns.Length * aggregates.Length;
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");

        string AxisValue(CanopyGridGroupLevel level, CanopyCell? cell) => cell?.Value == null ? view.Labels.GridGroupMissing :
            level.Bucket != null ? level.Bucket.Label(CanopyNumericValues.ToDouble(cell.Value), settings.Culture) : cell.DisplayText(view.GetColumn(level.Column), view.Labels);
        string ColumnCaption(CanopyPivotAxisNode node) => node.Other ? view.Labels.GridPivotOther : node.Parent == null ? view.Labels.GridSummary :
            string.Join(" / ", node.Path.Select((cell, index) => view.GetColumn(definition.Columns[index].Column).Title + ": " + AxisValue(definition.Columns[index], cell)));

        html.Append("<thead style=\"display:table-header-group;\"><tr><th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(view.Label)).Append("</th>");
        foreach (var column in columns) foreach (var aggregate in aggregates) {
            html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("white-space:normal;\">").Append(Encode(ColumnCaption(column)))
                .Append("<br>").Append(Encode(aggregate.Label));
            if (aggregate.ShowAs != CanopyShowAs.Value) html.Append("<br><span style=\"").Append(styles.Hidden).Append("\">")
                .Append(Encode(CanopyAggregateDisplay.Caption(aggregate.ShowAs, view.Labels))).Append("</span>");
            html.Append("</th>");
        }
        html.Append("</tr></thead><tbody>");

        void Values(CanopyPivotAxisNode row) {
            foreach (var column in columns) foreach (var aggregate in aggregates) {
                var shown = result.Display(row.Key, column.Key, aggregate.Id);
                var format = aggregate.Format ?? (aggregate.Counting ? CanopyGridNumberFormat.Fixed(0) : view.GetColumn(aggregate.Column).Format);
                var value = shown.Value;
                var text = !value.HasValue ? string.Empty : CanopyAggregateDisplay.IsPercentage(shown.Mode) ? value.Value.ToString("P2", settings.Culture) :
                    shown.Mode == CanopyShowAs.Rank ? value.Value.ToString("0", settings.Culture) : format?.Format(value.Value, settings.Culture) ?? value.Value.ToString("G", settings.Culture);
                html.Append("<td style=\"").Append(styles.Cell).Append("text-align:right;\">").Append(Encode(text)).Append("</td>");
            }
        }
        var rows = result.Rows.Where(node => node.Parent != null).ToArray();
        var parents = new HashSet<string>(rows.Where(node => node.Parent != null).Select(node => node.Parent!), StringComparer.Ordinal);
        var shownRows = 0;
        foreach (var row in rows) {
            if (row.Depth > settings.MaxDepth || shownRows >= settings.MaxRows) continue;
            var level = definition.Rows[row.Depth - 1];
            var parent = parents.Contains(row.Key);
            html.Append("<tr style=\"break-inside:avoid;page-break-inside:avoid;\"><th scope=\"row\" style=\"").Append(styles.Cell)
                .Append("text-align:left;padding-left:").Append(8 + (row.Depth - 1) * 16).Append("px;font-weight:").Append(parent ? "700" : "400").Append(";\">")
                .Append(parent ? "&#8722; " : "&#183; ").Append(Encode(view.GetColumn(level.Column).Title)).Append(": ")
                .Append(Encode(AxisValue(level, row.Path[row.Depth - 1]))).Append("</th>");
            Values(row); html.Append("</tr>"); shownRows++;
        }
        if (shownRows < rows.Length) AppendOverflow(html, shownRows, rows.Length, width, settings, styles, view.Labels);
        if (result.ColumnsLimited) {
            var note = view.Labels.GridPivotLimited.Replace("{shown}", result.RetainedColumns.Count.ToString("N0", settings.Culture))
                .Replace("{total}", result.DistinctColumns.ToString("N0", settings.Culture));
            html.Append("<tr><td colspan=\"").Append(width).Append("\" style=\"").Append(styles.Note).Append("\">").Append(Encode(note)).Append("</td></tr>");
        }
        html.Append("</tbody><tfoot><tr><th scope=\"row\" style=\"").Append(styles.Header).Append("\">").Append(Encode(view.Labels.GridSummary)).Append("</th>");
        Values(totalRow);
        return html.Append("</tr></tfoot></table>").ToString();
    }
}
