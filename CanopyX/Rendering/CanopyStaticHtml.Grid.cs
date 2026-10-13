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
        html.Append("<thead><tr>");
        foreach (var column in columns) html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append(Align(column)).Append("\">").Append(Encode(column.Title)).Append("</th>");
        html.Append("</tr></thead><tbody>");
        foreach (var row in rows) {
            var printedCells = new List<string>(columns.Length);
            var rowRule = CanopyGridHighlights.Find(view, row, null);
            var rowTone = rowRule != null && rowRule.Tone != CanopyTone.None ? rowRule.Tone : row.Tone;
            var rowClasses = string.Join(" ", new[] { row.ClassName, rowRule?.ClassName }.Where(value => !string.IsNullOrEmpty(value)));
            html.Append("<tr");
            if (rowClasses.Length != 0) html.Append(" class=\"").Append(Encode(rowClasses)).Append('"');
            if (rowTone != CanopyTone.None) html.Append(" style=\"").Append(styles.ToneColor(rowTone)).Append('"');
            html.Append('>');
            foreach (var column in columns) {
                row.Cells.TryGetValue(column.Id, out var cell);
                var rule = CanopyGridHighlights.Find(view, row, column.Id);
                var tone = rule != null && rule.Tone != CanopyTone.None ? rule.Tone : cell?.Tone ?? CanopyTone.None;
                html.Append("<td style=\"").Append(styles.Cell).Append(Align(column)).Append(styles.ToneColor(tone));
                if (column.Wrap) html.Append("white-space:pre-wrap;overflow-wrap:anywhere;");
                html.Append('"');
                if (rule?.ClassName != null) html.Append(" class=\"").Append(Encode(rule.ClassName)).Append('"');
                if (!string.IsNullOrEmpty(cell?.Title)) html.Append(" title=\"").Append(Encode(cell!.Title!)).Append('"');
                var text = new StringBuilder();
                html.Append('>');
                AppendVisibleText(html, GridPresenterText(view, row, column, cell), text);
                if (cell != null && cell.HasBadges) AppendBadges(html, cell.Badges, styles, text);
                html.Append("</td>");
                printedCells.Add(text.ToString());
            }
            html.Append("</tr>");
            printedRows.Add(printedCells.AsReadOnly());
        }
        html.Append("</tbody>");
        if (!matching.HasValue || rows.Length < matching.Value) {
            var note = (settings.OverflowNote ?? view.Labels.OverflowNote).Replace("{shown}", rows.Length.ToString("N0", settings.Culture))
                .Replace("{total}", matching.HasValue ? matching.Value.ToString("N0", settings.Culture) : view.Labels.UnknownTotal);
            html.Append("<tbody><tr><td colspan=\"").Append(columns.Length).Append("\" style=\"").Append(styles.Note).Append("\">").Append(Encode(note));
            if (IsSafeReportUrl(settings.FullReportUrl)) html.Append(" <a href=\"").Append(Encode(settings.FullReportUrl!)).Append("\" style=\"")
                .Append(styles.Link).Append("\">").Append(Encode(settings.FullReportText ?? view.Labels.FullReport)).Append("</a>");
            html.Append("</td></tr></tbody>");
        }
        return new CanopyStaticHtmlResult(html.Append("</table>").ToString(), printedRows.AsReadOnly(),
            matching.HasValue ? matching.Value : (long)offset + supplied.Count, !matching.HasValue);
    }
}
