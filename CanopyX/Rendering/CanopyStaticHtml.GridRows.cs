using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>Prints supplied records and their details in document order, sharing one remaining data-row budget.
    /// The return value counts records of this grid only; wrappers and records of nested views do not alter its total.</summary>
    private static int AppendGridRecords(StringBuilder html, CanopyDataGridView view, IList<CanopyGridRow> rows,
        CanopyColumn[] columns, CanopyStaticHtmlOptions settings, CanopyStaticStyles styles, ref int remaining,
        List<IReadOnlyList<string>>? captured, StringBuilder? detailText, out bool complete, IEnumerable<CanopyGridRow>? statsRows = null) {
        var formats = view.FormatRules.Count > 0 ? new CanopyFormatEvaluator(view, statsRows ?? rows) : null;
        var shown = 0;
        complete = true;
        foreach (var row in rows) {
            if (remaining == 0) break;
            remaining--; shown++;
            CaptureRow(AppendGridRow(html, view, row, columns, styles, formats?.Evaluate(row), detailText != null), captured, detailText);
            if (view.Reporting?.Detail is { Print: true } definition) {
                var detail = AppendGridDetail(html, definition, row.Detail, columns.Length, settings, styles, view.Labels,
                    ref remaining, out var detailComplete);
                if (detail != null) CaptureRow(detail, captured, detailText);
                complete &= detailComplete;
            }
        }
        complete &= shown == rows.Count;
        return shown;
    }

    /// <summary>The shared cell presentation owner for outer and nested grids: presenters, formatting, highlights,
    /// metadata and captured text all follow the same path.</summary>
    private static IReadOnlyList<string> AppendGridRow(StringBuilder html, CanopyDataGridView view, CanopyGridRow row,
        CanopyColumn[] columns, CanopyStaticStyles styles, CanopyFormatOutcome? outcome, bool inner) {
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
            var tone = rule != null && rule.Tone != CanopyTone.None ? rule.Tone : column.ValueTone(cell);
            html.Append("<td style=\"").Append((inner ? styles.InnerCell : styles.Cell)).Append(Align(column)).Append(styles.ToneColor(tone)).Append(Encode(FormatCellStyle(paint, outcome?.Row, first, styles)));
            if (column.Wrap) html.Append("white-space:pre-wrap;overflow-wrap:anywhere;");
            html.Append('"');
            var classes = string.Join(" ", new[] { rule?.ClassName, FormatClasses(paint) }.Where(value => value != null));
            if (classes.Length != 0) html.Append(" class=\"").Append(Encode(classes)).Append('"');
            var title = FormatTitle(column.NumericTone(cell)?.Label ?? cell?.Title, paint, outcome?.Row, first);
            if (title != null) html.Append(" title=\"").Append(Encode(title)).Append('"');
            var text = new StringBuilder();
            html.Append('>');
            AppendFormatBefore(html, paint, outcome?.Row, first, styles, text);
            if (paint?.BarValue == false) html.Append("<span style=\"position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;\">");
            AppendVisibleText(html, GridPresenterText(view, row, column, cell), text);
            if (cell != null && cell.HasBadges) AppendBadges(html, cell.Badges, styles, text);
            if (paint?.BarValue == false) html.Append("</span>");
            AppendFormatAfter(html, paint, outcome?.Row, first, styles, text);
            html.Append("</td>");
            first = false;
            printedCells.Add(text.ToString());
        }
        html.Append("</tr>");
        return printedCells.AsReadOnly();
    }

    private static void CaptureRow(IReadOnlyList<string> row, List<IReadOnlyList<string>>? captured, StringBuilder? detailText) {
        captured?.Add(row);
        if (detailText == null) return;
        foreach (var cell in row) {
            if (cell.Length == 0) continue;
            if (detailText.Length > 0) detailText.Append(' ');
            detailText.Append(cell);
        }
    }
}
