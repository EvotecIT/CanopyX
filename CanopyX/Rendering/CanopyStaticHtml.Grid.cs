using System;
using System.Collections.Generic;
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
    /// <returns>The table, displayed data and detail rows, and matching count before the static row limit.</returns>
    /// <remarks>Inline rows retain source order. Supplied pages preserve their accepted filtering and ordering.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The definition or page is invalid, or a host source has no snapshot.</exception>
    public static CanopyStaticHtmlResult RenderGridWithResult(CanopyDataGridView view, CanopyGridPage? page = null, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (page != null) _ = page.ToJson(view);
        else if (view.Source.Kind == CanopyGridSourceKind.Host) throw new InvalidOperationException("A host grid fallback requires an explicit result page.");
        return RenderGridRows(view, page?.Rows ?? view.Rows, page?.Matched ?? view.Rows.Count, page?.Offset ?? 0, options, page?.FooterValues);
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
    /// <returns>The table and displayed data and detail rows. An unknown matching total retains the accepted offset plus page size as a lower bound.</returns>
    /// <exception cref="ArgumentNullException">The view or page is null.</exception>
    /// <exception cref="InvalidOperationException">The page does not belong to this cursor grid or is inconsistent.</exception>
    public static CanopyStaticHtmlResult RenderGridWithResult(CanopyDataGridView view, CanopyGridCursorPage page, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (page == null) throw new ArgumentNullException(nameof(page));
        view.Validate();
        _ = page.ToJson(view);
        return RenderGridRows(view, page.Rows, page.Matched, page.Offset, options);
    }

    private static CanopyStaticHtmlResult RenderGridRows(CanopyDataGridView view, IList<CanopyGridRow> supplied, int? matching, int offset, CanopyStaticHtmlOptions? options, IDictionary<string, IDictionary<string, double?>>? footerValues = null, bool includeCaption = true) {
        var allRows = view.Source.Kind == CanopyGridSourceKind.Inline ? view.CalculateRows(view.Rows).ToList() : supplied;
        supplied = ReferenceEquals(supplied, view.Rows) ? allRows : view.CalculateRows(supplied).ToList();
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var columns = view.Columns.Where(column => !column.Hidden).ToArray();
        if (view.Compare != null) columns = columns.OrderByDescending(column => column.RowHeader).ToArray();
        var capacity = Math.Min(supplied.Count, settings.MaxRows);
        var html = new StringBuilder(256 + capacity * 160);
        var printedRows = new List<IReadOnlyList<string>>(capacity);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append("\">");
        var caption = includeCaption ? settings.Caption ?? view.Label : string.Empty;
        if (caption.Length != 0) html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption)).Append("</caption>");
        html.Append("<thead>");
        AppendGridHeader(html, view, columns, styles);
        html.Append("</thead><tbody>");
        var remaining = settings.MaxRows;
        var shown = AppendGridRecords(html, view, supplied, columns, settings, styles, ref remaining, printedRows, null, out var complete,
            allRows);
        html.Append("</tbody>");
        if (!matching.HasValue || shown < matching.Value) {
            html.Append("<tbody>");
            AppendOverflow(html, shown, matching, columns.Length, settings, styles, view.Labels);
            html.Append("</tbody>");
        }
        AppendGridFooters(html, view, columns, supplied, matching, offset, footerValues, styles, settings);
        AppendFormatLegend(html, view, columns.Length, styles, settings.Culture);
        return new CanopyStaticHtmlResult(html.Append("</table>").ToString(), printedRows.AsReadOnly(),
            matching.HasValue ? matching.Value : (long)offset + supplied.Count, !matching.HasValue,
            complete && matching.HasValue && offset == 0 && shown == matching.Value);
    }

    /// <summary>
    /// The header rows: one row per column-group level above the column titles. A group spans its visible columns; a column
    /// outside a group, or in a shallower one, spans down to the bottom row, as the browser draws it. Group cells are column
    /// headers with colspan, which the table model associates with every column they cover.
    /// </summary>
    private static void AppendGridHeader(StringBuilder html, CanopyDataGridView view, CanopyColumn[] columns, CanopyStaticStyles styles, StringBuilder? text = null) {
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
                    html.Append("<th scope=\"col\" colspan=\"").Append(end - index).Append("\" style=\"").Append(text == null ? styles.Header : styles.InnerHeader).Append("\">");
                    AppendVisibleText(html, group.Title, text, true); html.Append("</th>");
                    index = end;
                    continue;
                }
                if (level == path.Count) {
                    html.Append("<th scope=\"col\"");
                    if (depth > level) html.Append(" rowspan=\"").Append(depth - level + 1).Append('"');
                    var className = columns[index].ClassName;
                    if (className != null) html.Append(" class=\"").Append(Encode(className)).Append('"');
                    html.Append(" style=\"").Append(text == null ? styles.Header : styles.InnerHeader)
                        .Append(view.Compare != null ? "white-space:normal;" : string.Empty).Append(Align(columns[index])).Append("\">");
                    AppendVisibleText(html, columns[index].Title, text, true); html.Append("</th>");
                }
                index++;
            }
            html.Append("</tr>");
        }
    }
}
