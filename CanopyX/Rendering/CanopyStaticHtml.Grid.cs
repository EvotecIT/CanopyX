using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Renders a flat-grid fallback as a script-free table with inline styles.</summary>
    /// <param name="view">The grid definition and its typed columns.</param>
    /// <param name="page">An optional accepted query window. Host sources require this explicit snapshot.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>The fallback table, including a note when only part of the matching result is supplied or shown.</returns>
    /// <remarks>
    /// Without a page, inline rows retain source order. This renderer does not execute queries: a host supplies the
    /// accepted query result as a page when its filtering or ordering matters. It does not construct general static report tables.
    /// </remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition or page is invalid, or a host source has no snapshot.</exception>
    public static string RenderGrid(CanopyDataGridView view, CanopyGridPage? page = null, CanopyStaticHtmlOptions? options = null) {
        return RenderGridWithResult(view, page, options).Html;
    }

    /// <summary>Renders a flat-grid fallback and captures its visible cell text in the same pass.</summary>
    /// <param name="view">The grid definition and its typed columns.</param>
    /// <param name="page">An optional accepted query window. Host sources require this explicit snapshot.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>The table, displayed data rows and matching count before the static row limit.</returns>
    /// <remarks>Inline rows retain source order. Supplied pages preserve their accepted filtering and ordering.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition or page is invalid, or a host source has no snapshot.</exception>
    public static CanopyStaticHtmlResult RenderGridWithResult(CanopyDataGridView view, CanopyGridPage? page = null, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (page != null) _ = page.ToJson(view);
        else if (view.Source.Kind == CanopyGridSourceKind.Host) throw new InvalidOperationException("A host grid fallback requires an explicit result page.");
        return RenderGridRows(view, page?.Rows ?? view.Rows, page?.Matched ?? view.Rows.Count, page?.Offset ?? 0, options);
    }

    /// <summary>Renders a supplied cursor window without inventing a complete matching count.</summary>
    /// <param name="view">The owning cursor-grid definition.</param>
    /// <param name="page">An accepted cursor page, including its actual position and nullable counts.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>A script-free fallback table with an explicit unknown total when the host omitted it.</returns>
    /// <exception cref="ArgumentNullException">The view or page is null.</exception>
    /// <exception cref="InvalidOperationException">The page does not belong to this cursor grid or is inconsistent.</exception>
    public static string RenderGrid(CanopyDataGridView view, CanopyGridCursorPage page, CanopyStaticHtmlOptions? options = null) {
        return RenderGridWithResult(view, page, options).Html;
    }

    /// <summary>Renders an accepted cursor window and its visible cell text without inventing a matching count.</summary>
    /// <param name="view">The owning cursor-grid definition.</param>
    /// <param name="page">The accepted cursor page, including its actual offset and nullable counts.</param>
    /// <param name="options">Row limit, caption, theme and link to the full report.</param>
    /// <returns>The table and displayed data rows. An unknown matching total retains the accepted offset plus page size as a lower bound.</returns>
    /// <exception cref="ArgumentNullException">The view or page is null.</exception>
    /// <exception cref="InvalidOperationException">The page does not belong to this cursor grid or is inconsistent.</exception>
    public static CanopyStaticHtmlResult RenderGridWithResult(CanopyDataGridView view, CanopyGridCursorPage page, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (page == null) throw new ArgumentNullException(nameof(page));
        view.Validate();
        _ = page.ToJson(view);
        return RenderGridRows(view, page.Rows, page.Matched, page.Offset, options);
    }

    private static CanopyStaticHtmlResult RenderGridRows(CanopyDataGridView view, IList<CanopyGridRow> supplied, int? matching, int offset, CanopyStaticHtmlOptions? options) {
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var columns = view.Columns.Where(column => !column.Hidden).ToArray();
        var rows = supplied.Take(settings.MaxRows).ToArray();
        var html = new StringBuilder(256 + rows.Length * 160);
        var printedRows = new List<IReadOnlyList<string>>(rows.Length);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        html.Append("<thead>");
        AppendGridHeader(html, view, columns, styles);
        html.Append("</thead><tbody>");
        // Formatting rules evaluate as in the browser; automatic bounds come from the supplied rows.
        var formats = view.FormatRules.Count > 0 ? new CanopyFormatEvaluator(view, supplied) : null;
        var remaining = settings.MaxRows;
        foreach (var row in rows) {
            if (remaining == 0) break;
            remaining--;
            var outcome = formats?.Evaluate(row);
            var printedCells = new List<string>(columns.Length);
            var rowRule = CanopyGridHighlights.Find(view, row, null);
            var rowTone = rowRule != null && rowRule.Tone != CanopyTone.None ? rowRule.Tone : row.Tone;
            var rowClasses = string.Join(" ", new[] { row.ClassName, rowRule?.ClassName, outcome?.Row?.ClassName }.Where(value => !string.IsNullOrEmpty(value)));
            html.Append("<tr");
            if (rowClasses.Length != 0) html.Append(" class=\"").Append(Encode(rowClasses)).Append('"');
            var rowFormat = FormatRowStyle(outcome, styles);
            if (rowTone != CanopyTone.None || rowFormat.Length != 0) html.Append(" style=\"").Append(styles.ToneColor(rowTone)).Append(Encode(rowFormat)).Append('"');
            html.Append('>');
            var first = true;
            foreach (var column in columns) {
                var paint = outcome?.Cell(column.Id);
                row.Cells.TryGetValue(column.Id, out var cell);
                var rule = CanopyGridHighlights.Find(view, row, column.Id);
                var tone = rule != null && rule.Tone != CanopyTone.None ? rule.Tone : cell?.Tone ?? CanopyTone.None;
                html.Append("<td style=\"").Append(styles.Cell).Append(Align(column)).Append(styles.ToneColor(tone)).Append(Encode(FormatCellStyle(paint, outcome?.Row, first, styles)));
                if (column.Wrap) html.Append("white-space:pre-wrap;overflow-wrap:anywhere;");
                html.Append('"');
                var classes = string.Join(" ", new[] { rule?.ClassName, FormatClasses(paint) }.Where(value => value != null));
                if (classes.Length != 0) html.Append(" class=\"").Append(Encode(classes)).Append('"');
                var title = FormatTitle(cell?.Title, paint, outcome?.Row, first);
                if (title != null) html.Append(" title=\"").Append(Encode(title)).Append('"');
                var text = new StringBuilder();
                html.Append('>');
                AppendFormatBefore(html, paint, outcome?.Row, first, styles);
                if (paint?.BarValue == false) html.Append("<span style=\"position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;\">");
                AppendVisibleText(html, GridPresenterText(view, row, column, cell), text);
                if (cell != null && cell.HasBadges) AppendBadges(html, cell.Badges, styles, text);
                if (paint?.BarValue == false) html.Append("</span>");
                AppendFormatAfter(html, paint, outcome?.Row, first, styles);
                html.Append("</td>");
                first = false;
                printedCells.Add(text.ToString());
            }
            html.Append("</tr>");
            printedRows.Add(printedCells.AsReadOnly());
            // Detail rows print under their record (unless the definition excludes them from print); HTML stays text.
            string? detailOverflow = null;
            var detail = view.Reporting?.Detail is { Print: true } definition ? StaticDetail(definition, row.Detail, settings, view.Labels, ref remaining, out detailOverflow) : null;
            if (detail != null) AppendDetail(html, detail, 1, columns.Length, styles, view.Labels);
            if (detailOverflow != null) html.Append("<tr><td colspan=\"").Append(columns.Length).Append("\" style=\"").Append(styles.Note).Append("\">").Append(Encode(detailOverflow)).Append("</td></tr>");
        }
        html.Append("</tbody>");
        if (!matching.HasValue || printedRows.Count < matching.Value) {
            var note = (settings.OverflowNote ?? view.Labels.OverflowNote).Replace("{shown}", printedRows.Count.ToString("N0", settings.Culture))
                .Replace("{total}", matching.HasValue ? matching.Value.ToString("N0", settings.Culture) : view.Labels.UnknownTotal);
            html.Append("<tbody><tr><td colspan=\"").Append(columns.Length).Append("\" style=\"").Append(styles.Note).Append("\">").Append(Encode(note));
            if (IsSafeReportUrl(settings.FullReportUrl)) html.Append(" <a href=\"").Append(Encode(settings.FullReportUrl!)).Append("\" style=\"")
                .Append(styles.Link).Append("\">").Append(Encode(settings.FullReportText ?? view.Labels.FullReport)).Append("</a>");
            html.Append("</td></tr></tbody>");
        }
        AppendFormatLegend(html, view, columns.Length, styles, settings.Culture);
        return new CanopyStaticHtmlResult(html.Append("</table>").ToString(), printedRows.AsReadOnly(),
            matching.HasValue ? matching.Value : (long)offset + supplied.Count, !matching.HasValue);
    }

    /// <summary>A record's detail as the static table, property list or text the fallback prints: nested grid rows and tree
    /// roots become a table with the nested view's visible columns, tree levels indented.</summary>
    private static CanopyDetail? StaticDetail(CanopyGridDetail definition, CanopyDetail? detail, CanopyStaticHtmlOptions settings, CanopyLabels labels, ref int remaining, out string? overflow) {
        overflow = null;
        if (detail is CanopyGridRowsDetail rows && definition.View != null) {
            var columns = definition.View.Columns.Where(column => !column.Hidden).ToArray();
            var table = new CanopyTableDetail(definition.Label).AddColumns(columns.Select(column => column.Title).ToArray());
            foreach (var row in rows.Rows.Take(remaining)) table.AddRow(columns.Select(column => {
                row.Cells.TryGetValue(column.Id, out var cell);
                return ProjectStaticCell(cell, cell?.DisplayText(column.Kind, definition.View.Labels) ?? string.Empty);
            }).ToArray());
            remaining -= table.Rows.Count;
            if (table.Rows.Count < rows.Rows.Count) overflow = DetailOverflow(table.Rows.Count, rows.Rows.Count, settings, labels);
            return table;
        }
        if (detail is CanopyTreeDetail tree && definition.TreeView != null) {
            var columns = definition.TreeView.Columns.Where(column => !column.Hidden).ToArray();
            var table = new CanopyTableDetail(definition.Label).AddColumns(columns.Select(column => column.Title).ToArray());
            var pending = new Stack<(CanopyNode Node, int Level)>();
            for (var index = tree.Roots.Count - 1; index >= 0; index--) pending.Push((tree.Roots[index], 0));
            var total = 0;
            while (pending.Count > 0) {
                var (node, level) = pending.Pop();
                total++;
                if (table.Rows.Count < remaining) table.AddRow(columns.Select((column, index) => {
                    var text = TreeCellText(node, column, index == 0, definition.TreeView.Labels, out var cell);
                    return ProjectStaticCell(cell, (index == 0 ? new string('\u00A0', level * 2) : string.Empty) + text,
                        index == 0 && node.HasBadges ? node.Badges : null);
                }).ToArray());
                for (var child = node.Children.Count - 1; child >= 0; child--) pending.Push((node.Children[child], level + 1));
            }
            remaining -= table.Rows.Count;
            if (table.Rows.Count < total) overflow = DetailOverflow(table.Rows.Count, total, settings, labels);
            return table;
        }
        return detail is CanopyTableDetail || detail is CanopyPropertiesDetail || detail is CanopyHtmlDetail ? detail : null;
    }

    /// <summary>Keeps a cell's presentation while its typed value becomes formatted nested-table text; tree identity
    /// cells retain node badges before cell badges, matching the standalone outline.</summary>
    private static CanopyCell ProjectStaticCell(CanopyCell? cell, string text, IEnumerable<CanopyBadge>? nodeBadges = null) {
        var projected = new CanopyCell(text) { Tone = cell?.Tone ?? CanopyTone.None, Title = cell?.Title };
        if (nodeBadges != null) foreach (var badge in nodeBadges) projected.Badges.Add(badge);
        if (cell != null && cell.HasBadges) foreach (var badge in cell.Badges) projected.Badges.Add(badge);
        return projected;
    }

    private static string DetailOverflow(int shown, int total, CanopyStaticHtmlOptions settings, CanopyLabels labels) =>
        (settings.OverflowNote ?? labels.OverflowNote).Replace("{shown}", shown.ToString("N0", settings.Culture))
            .Replace("{total}", total.ToString("N0", settings.Culture));

    /// <summary>
    /// The header rows: one row per column-group level above the column titles. A group spans its visible columns; a column
    /// outside a group, or in a shallower one, spans down to the bottom row, as the browser draws it. Group cells are column
    /// headers with colspan, which the table model associates with every column they cover.
    /// </summary>
    private static void AppendGridHeader(StringBuilder html, CanopyDataGridView view, CanopyColumn[] columns, CanopyStaticStyles styles) {
        var paths = columns.Select(column => view.ColumnGroupPath(column.Id)).ToArray();
        var depth = paths.Length == 0 ? 0 : paths.Max(path => path.Count);
        for (var level = 0; level <= depth; level++) {
            html.Append("<tr>");
            for (var index = 0; index < columns.Length;) {
                var path = paths[index];
                if (level < path.Count) {
                    var group = path[level];
                    var end = index + 1;
                    while (end < columns.Length && paths[end].Count > level && paths[end][level] == group) end++;
                    html.Append("<th scope=\"col\" colspan=\"").Append(end - index).Append("\" style=\"").Append(styles.Header).Append("\">").Append(Encode(group.Title)).Append("</th>");
                    index = end;
                    continue;
                }
                if (level == path.Count) {
                    html.Append("<th scope=\"col\"");
                    if (depth > level) html.Append(" rowspan=\"").Append(depth - level + 1).Append('"');
                    html.Append(" style=\"").Append(styles.Header).Append(Align(columns[index])).Append("\">").Append(Encode(columns[index].Title)).Append("</th>");
                }
                index++;
            }
            html.Append("</tr>");
        }
    }
}
