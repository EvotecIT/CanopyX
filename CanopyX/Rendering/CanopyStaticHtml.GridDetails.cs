using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Composes nested payloads with the same record and outline writers used for standalone views.
    /// A detail remains one captured cell, including its captions and headers but excluding overflow and legends.</summary>
    private static IReadOnlyList<string>? AppendGridDetail(StringBuilder html, CanopyGridDetail definition, CanopyDetail? detail,
        int columnCount, CanopyStaticHtmlOptions settings, CanopyStaticStyles styles, CanopyLabels labels,
        ref int remaining, out bool complete) {
        complete = true;
        if (detail is CanopyGridRowsDetail rows && definition.View is CanopyDataGridView grid) {
            var columns = grid.Columns.Where(column => !column.Hidden).ToArray();
            var text = new StringBuilder();
            BeginDetail(html, 1, columnCount, styles);
            BeginDetailTable(html, definition.Label, styles, text);
            html.Append("<thead>"); AppendGridHeader(html, grid, columns, styles, text); html.Append("</thead><tbody>");
            var shown = AppendGridRecords(html, grid, rows.Rows, columns, settings, styles, ref remaining, null, text, out complete);
            html.Append("</tbody>");
            AppendFormatLegend(html, grid, columns.Length, styles, settings.Culture);
            html.Append("</table></td></tr>");
            if (shown < rows.Rows.Count) AppendOverflow(html, shown, rows.Rows.Count, columnCount, settings, styles, labels);
            return Array.AsReadOnly(new[] { text.ToString() });
        }
        if (detail is CanopyTreeDetail tree && definition.TreeView is CanopyTreeView view) {
            var columns = view.Columns.Where((column, index) => index == 0 || !column.Hidden).ToList();
            var rowsToShow = CollectRows(tree.Roots, settings, remaining, out var total, out var hiddenBelow, out var unknown);
            remaining -= rowsToShow.Count;
            var text = new StringBuilder();
            BeginDetail(html, 1, columnCount, styles);
            BeginDetailTable(html, definition.Label, styles, text);
            html.Append("<thead><tr>");
            foreach (var column in columns) {
                html.Append("<th scope=\"col\" style=\"").Append(styles.InnerHeader).Append(Align(column)).Append("\">");
                AppendVisibleText(html, column.Title, text, true); html.Append("</th>");
            }
            html.Append("</tr></thead><tbody>");
            var checks = view.Checkboxes == CanopyCheckboxMode.None ? null : new CanopyCheckIntentIndex(view);
            var path = new List<string>();
            foreach (var (node, level) in rowsToShow) {
                if (checks != null) {
                    while (path.Count >= level) path.RemoveAt(path.Count - 1);
                    path.Add(node.Id);
                }
                var cells = node.Detail != null
                    ? AppendDetail(html, node.Detail, level, columns.Count, styles, view.Labels)
                    : AppendRow(html, node, level, columns, hiddenBelow.TryGetValue(node, out var hidden) ? hidden : 0,
                        settings, styles, view.Labels, checks?.State(path), true);
                CaptureRow(cells, null, text);
            }
            html.Append("</tbody></table></td></tr>");
            complete = !unknown && rowsToShow.Count == total;
            if (!complete) AppendOverflow(html, rowsToShow.Count, unknown ? null : total, columnCount, settings, styles, labels);
            return Array.AsReadOnly(new[] { text.ToString() });
        }
        return detail is CanopyTableDetail || detail is CanopyPropertiesDetail || detail is CanopyHtmlDetail
            ? AppendDetail(html, detail, 1, columnCount, styles, labels) : null;
    }

}
