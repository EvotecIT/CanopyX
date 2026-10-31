using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    private static void AppendCalculationErrors(StringBuilder html, CanopyColumn[] columns, IEnumerable<CanopyGridRow> rows, CanopyStaticStyles styles) {
        var errors = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows) foreach (var column in columns) {
            if (column.Calculation == null || !row.Cells.TryGetValue(column.Id, out var cell) || cell == null ||
                cell.Tone != CanopyTone.Danger || cell.Title == null || !(cell.Text is string marker) || !marker.StartsWith("#", StringComparison.Ordinal)) continue;
            errors.Add(marker + ": " + cell.Title);
        }
        if (errors.Count == 0) return;
        html.Append("<tbody><tr><td colspan=\"").Append(columns.Length).Append("\" style=\"").Append(styles.Cell).Append("\"><ul>");
        foreach (var error in errors.OrderBy(error => error, StringComparer.Ordinal)) html.Append("<li>").Append(Encode(error)).Append("</li>");
        html.Append("</ul></td></tr></tbody>");
    }

    private static string AggregateName(CanopyDataGridView view, CanopyGridAggregate aggregate) {
        var labels = view.Labels;
        var operation = aggregate.Operation == CanopyGridAggregateOperation.Count ? labels.GridAggregateCount :
            aggregate.Operation == CanopyGridAggregateOperation.Sum ? labels.GridAggregateSum :
            aggregate.Operation == CanopyGridAggregateOperation.Average ? labels.GridAggregateAverage :
            aggregate.Operation == CanopyGridAggregateOperation.Minimum ? labels.GridAggregateMinimum :
            aggregate.Operation == CanopyGridAggregateOperation.Maximum ? labels.GridAggregateMaximum :
            aggregate.Operation == CanopyGridAggregateOperation.DistinctCount ? labels.GridAggregateDistinct : aggregate.CustomOperation ?? aggregate.Operation.ToString();
        operation = operation.Replace("{value}", "").Trim();
        if (operation.Length == 0) operation = aggregate.CustomOperation ?? aggregate.Operation.ToString();
        return aggregate.Label + " · " + char.ToUpper(operation[0], CultureInfo.InvariantCulture) + operation.Substring(1);
    }

    private static string AggregateText(CanopyDataGridView view, CanopyGridAggregate aggregate, double? value, CanopyShowAs mode, CultureInfo culture) {
        if (!value.HasValue) return string.Empty;
        if (CanopyAggregateDisplay.IsPercentage(mode)) {
            var percent = (CultureInfo)culture.Clone(); percent.NumberFormat.PercentPositivePattern = 1; percent.NumberFormat.PercentNegativePattern = 1;
            return value.Value.ToString("P2", percent);
        }
        if (mode == CanopyShowAs.Rank) return value.Value.ToString("0", culture);
        var format = aggregate.Format ?? (aggregate.Counting ? CanopyGridNumberFormat.Fixed(0) : view.GetColumn(aggregate.Column).Format) ?? CanopyGridNumberFormat.Fixed(2);
        return format.Format(value.Value, culture);
    }
}
