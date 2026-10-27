using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyLabels {
    private static void AddAnalysisDefaults(Dictionary<string, string> defaults) {
        foreach (var entry in new Dictionary<string, string>(StringComparer.Ordinal) {
        [nameof(GridCalculationAdd)] = "Add calculated column",
        [nameof(GridCalculationTitle)] = "Column title",
        [nameof(GridCalculationId)] = "Column ID",
        [nameof(GridCalculationExpression)] = "Expression",
        [nameof(GridCalculationError)] = "Calculation error: {error}",
        [nameof(GridCalculationInvalid)] = "Check the expression, column references and result kind.",
        [nameof(GridCalculationHelp)] = "Use [columnId], arithmetic, IF, COALESCE, ROUND, CONCAT, DATEPART or DATEDIFF.",
        [nameof(GridCalculationNumber)] = "Number",
        [nameof(GridCalculationDate)] = "Date and time",
        [nameof(GridPivot)] = "Pivot",
        [nameof(GridPivotRows)] = "Row groups",
        [nameof(GridPivotColumns)] = "Column groups",
        [nameof(GridPivotValues)] = "Values",
        [nameof(GridPivotFlat)] = "Show records",
        [nameof(GridPivotConfigure)] = "Configure pivot",
        [nameof(GridPivotOther)] = "Other",
        [nameof(GridPivotLimited)] = "Showing {shown} of {total} column paths; the rest are combined in Other. Subtotals include all matching descendants.",
        [nameof(GridPivotColumn)] = "Choose column",
        [nameof(GridPivotTopN)] = "Top columns",
        [nameof(GridPivotSort)] = "Sort rows by total",
        [nameof(GridPivotDrill)] = "Show records for {row}, {column}",
        [nameof(GridPivotReturn)] = "Return to pivot",
        [nameof(GridPivotInvalid)] = "Choose valid pivot axes and at least one value.",
        [nameof(GridShowAs)] = "Show values as",
        [nameof(GridShowAsValue)] = "Value",
        [nameof(GridShowAsPercentGrandTotal)] = "as % of total",
        [nameof(GridShowAsPercentParent)] = "as % of parent",
        [nameof(GridShowAsPercentColumn)] = "as % of column",
        [nameof(GridShowAsPercentRow)] = "as % of row",
        [nameof(GridShowAsRunningTotal)] = "as running total",
        [nameof(GridShowAsRank)] = "as rank",
        [nameof(GridShowAsDifference)] = "as difference from previous",
        [nameof(GridShowAsPercentChange)] = "as % change from previous",
        [nameof(GridBucket)] = "Bucket",
        [nameof(GridBucketNone)] = "Exact values",
        [nameof(GridBucketDay)] = "Day",
        [nameof(GridBucketWeek)] = "Week",
        [nameof(GridBucketMonth)] = "Month",
        [nameof(GridBucketQuarter)] = "Quarter",
        [nameof(GridBucketYear)] = "Year",
        [nameof(GridBucketHour)] = "Hour of day",
        [nameof(GridBucketWeekday)] = "Weekday",
        [nameof(GridBucketWidth)] = "Range width",
        [nameof(GridBucketEdges)] = "Range edges",
        [nameof(GridBucketOrigin)] = "Range origin",
        [nameof(GridBucketInvalid)] = "Enter valid bucket settings.",
        }) defaults.Add(entry.Key, entry.Value);
    }
}
