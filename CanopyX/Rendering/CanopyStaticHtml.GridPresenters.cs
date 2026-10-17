using System;
using System.Globalization;
using System.Linq;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    private static string GridPresenterText(CanopyDataGridView view, CanopyGridRow row, CanopyColumn column, CanopyCell? cell) {
        var presenter = column.Presenter;
        var text = cell?.DisplayText(column.Kind, view.Labels) ?? string.Empty;
        if (presenter?.Kind == CanopyGridPresenterKind.StatusStrip && cell != null && cell.Series.Count > 0) {
            return string.Join("; ", cell.Series.GroupBy(point => point.State ?? (point.Value.HasValue ? point.Value.Value.ToString("G", CultureInfo.InvariantCulture) : view.Labels.GridNoData))
                .Select(group => group.Key + ": " + group.Count().ToString(CultureInfo.InvariantCulture)));
        }
        if ((presenter?.Kind == CanopyGridPresenterKind.SparklineBars || presenter?.Kind == CanopyGridPresenterKind.SparklineLine) && cell != null && cell.Series.Count > 0)
            return string.Join(", ", cell.Series.Select(point => point.Period + ": " + (point.Value.HasValue ? point.Value.Value.ToString("G", CultureInfo.InvariantCulture) : view.Labels.GridNoData)));
        if (string.IsNullOrEmpty(text)) return "—";
        if (presenter?.Kind == CanopyGridPresenterKind.Boolean && cell?.Value is bool flag) return flag ? "✓" : "—";
        if (presenter?.Kind == CanopyGridPresenterKind.Identifier) {
            var secondary = cell?.Secondary;
            if (presenter.SecondaryColumn != null && row.Cells.TryGetValue(presenter.SecondaryColumn, out var other)) {
                var declared = view.Columns.First(item => item.Id == presenter.SecondaryColumn); secondary = other?.DisplayText(declared.Kind, view.Labels);
            }
            return string.IsNullOrEmpty(secondary) ? text : text + " · " + secondary;
        }
        if (presenter?.Kind == CanopyGridPresenterKind.Change && presenter.DeltaColumn != null && row.Cells.TryGetValue(presenter.DeltaColumn, out var delta) && CanopyGridValues.Normalize(delta?.Value) is object rawDelta) {
            var value = CanopyNumericValues.ToDouble(rawDelta);
            return (value == 0 ? "0" : (value > 0 ? "↑ " : "↓ ") + Math.Abs(value).ToString("G", CultureInfo.InvariantCulture)) + " " + text;
        }
        return text;
    }
}
