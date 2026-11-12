using System;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    private static string GridPresenterText(CanopyDataGridView view, CanopyGridRow row, CanopyColumn column, CanopyCell? cell) {
        var presenter = column.Presenter;
        if (view.Compare != null && column.Id == view.Compare.StatusColumn) return ComparisonStatusText(view.Compare, column, cell, view.Labels);
        if (view.Compare != null && row.Cells.TryGetValue(view.Compare.StatusColumn, out var status) && Equals(status.Value, "removed") && cell?.Changes.Count > 0)
            return ComparisonValueText(cell.Changes[0].Before, column, view.Labels);
        if (presenter?.BeforeAfterValues == true && cell?.Changes.Count > 0)
            return string.Join("; ", cell.Changes.Select(change => BeforeAfterText(change, column, view.Labels)));
        var text = cell?.DisplayText(column, view.Labels) ?? string.Empty;
        if (presenter?.Kind == CanopyGridPresenterKind.StatusStrip && cell != null && cell.Series.Count > 0) {
            return string.Join("; ", cell.Series.GroupBy(point => point.State ?? (point.Value.HasValue ? point.Value.Value.ToString("G", CultureInfo.InvariantCulture) : view.Labels.GridNoData))
                .Select(group => group.Key + ": " + group.Count().ToString(CultureInfo.InvariantCulture)));
        }
        if ((presenter?.Kind == CanopyGridPresenterKind.SparklineBars || presenter?.Kind == CanopyGridPresenterKind.SparklineLine) && cell != null && cell.Series.Count > 0)
            return string.Join(", ", cell.Series.Select(point => point.Period + ": " + (point.Value.HasValue ? point.Value.Value.ToString("G", CultureInfo.InvariantCulture) : view.Labels.GridNoData)));
        if (cell?.Value == null && cell?.Text == string.Empty) return string.Empty;
        if (string.IsNullOrEmpty(text)) return "—";
        if (presenter?.Kind == CanopyGridPresenterKind.Boolean && cell?.Value is bool flag) return flag ? "✓" : "—";
        if (presenter?.Kind == CanopyGridPresenterKind.Identifier || presenter?.Kind == CanopyGridPresenterKind.RelativeTime) {
            var secondary = cell?.Secondary;
            if (presenter.SecondaryColumn != null && row.Cells.TryGetValue(presenter.SecondaryColumn, out var other)) {
                var declared = view.Columns.First(item => item.Id == presenter.SecondaryColumn); secondary = other?.DisplayText(declared, view.Labels);
            }
            return string.IsNullOrEmpty(secondary) ? text : text + " · " + secondary;
        }
        if (presenter?.Kind == CanopyGridPresenterKind.Change && presenter.DeltaColumn != null && row.Cells.TryGetValue(presenter.DeltaColumn, out var delta) && CanopyGridValues.Normalize(delta?.Value) is object rawDelta) {
            var value = CanopyNumericValues.ToDouble(rawDelta);
            return (value == 0 ? "0" : (value > 0 ? "↑ " : "↓ ") + Math.Abs(value).ToString("G", CultureInfo.InvariantCulture)) + " " + text;
        }
        return text;
    }

    /// <summary>Writes presenters whose static form is more than their text: a log as a preformatted block, and a state pill or
    /// glyph as its decorative mark before the text. The captured text stays the value's own.</summary>
    private static bool AppendPresenterBlock(StringBuilder html, CanopyColumn column, CanopyCell? cell, string displayed, StringBuilder text) {
        var presenter = column.Presenter;
        if (presenter?.Kind == CanopyGridPresenterKind.Log) {
            var lines = cell != null && cell.Events.Count > 0
                ? string.Join("\n", cell.Events.Select(item => string.Join(" ", new[] {
                    item.Time?.ToString("yyyy-MM-dd HH:mm:ss'Z'", CultureInfo.InvariantCulture), item.Kind, item.Summary }.Where(part => !string.IsNullOrEmpty(part)))))
                : cell?.Value is string value && value.Length > 0 ? value.Replace("\r\n", "\n") : null;
            if (lines == null) return false;
            html.Append("<pre style=\"margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,Consolas,monospace;\">");
            AppendVisibleText(html, lines, text);
            html.Append("</pre>");
            return true;
        }
        if (presenter?.Kind != CanopyGridPresenterKind.State || !presenter.Pill && presenter.Icons.Count == 0 || displayed == "—" || displayed.Length == 0) return false;
        var glyph = cell?.Value is string raw && presenter.Icons.TryGetValue(raw, out var icon) ? icon : presenter.Pill ? "●" : null;
        if (glyph != null) html.Append("<span aria-hidden=\"true\">").Append(Encode(glyph)).Append("&#160;</span>");
        AppendVisibleText(html, displayed, text);
        return true;
    }
}