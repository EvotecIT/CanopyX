using System.Globalization;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
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
