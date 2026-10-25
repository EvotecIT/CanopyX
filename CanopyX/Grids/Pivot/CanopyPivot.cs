using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;

namespace CanopyX;

/// <summary>Pure bounded pivot calculation for inline records and grouped hosted contributions.</summary>
public static partial class CanopyPivot {
    /// <summary>Computes a pivot from complete accepted inline records, with at most 100,000 contributions and populated intersections.</summary>
    /// <param name="view">The owning reporting view.</param>
    /// <param name="definition">The axes, aggregate identities and column cap.</param>
    /// <param name="rows">Complete filtered records, before paging; the caller owns query evaluation.</param>
    /// <param name="customAggregate">Optional calculation for a declared custom operation, given nonmissing raw cells.</param>
    /// <returns>The pivot, with exact prefix totals and retained paths for drill-through.</returns>
    public static CanopyPivotResult Compute(CanopyDataGridView view, CanopyGridPivot definition, IEnumerable<CanopyGridRow> rows,
        Func<CanopyGridAggregate, IReadOnlyList<CanopyCell?>, double?>? customAggregate = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (definition == null) throw new ArgumentNullException(nameof(definition));
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        view.Validate(); definition.Validate(view);
        var aggregates = definition.Values.Select(id => view.Reporting!.Aggregates.First(value => value.Id == id)).ToArray();
        var contributions = new List<CanopyPivotContribution>();
        foreach (var row in rows) {
            if (row == null || contributions.Count == 100000) throw new InvalidOperationException("Inline pivot input supports at most 100,000 records. Use a hosted pivot for larger datasets.");
            object? Raw(string column) => row.Cells.TryGetValue(column, out var value) ? CanopyGridValues.Normalize(value?.Value) : null;
            object? Axis(CanopyGridGroupLevel level) => level.Bucket == null ? Normalize(Raw(level.Column)) : level.Bucket.Key(Raw(level.Column));
            var values = aggregates.Select(aggregate => Raw(aggregate.Column)).ToArray();
            contributions.Add(new CanopyPivotContribution {
                Rows = definition.Rows.Select(Axis).ToArray(), Columns = definition.Columns.Select(Axis).ToArray(), Count = 1,
                Values = aggregates.Select((aggregate, index) => aggregate.Numeric && values[index] != null ? (double?)CanopyNumericValues.ToDouble(values[index]!) : null).ToArray(),
                Counts = values.Select(value => value == null ? 0 : 1).ToArray(), Distinct = values.Select(Normalize).ToArray()
            });
        }
        return FromContributions(view, definition, contributions, customAggregate);
    }

    internal static object? Normalize(object? value) => value is DateTime date ? (object)new DateTime(date.Ticks - date.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc) :
        value is long || value is decimal || value is double ? CanopyNumericValues.ToDouble(value!) : CanopyGridValues.Normalize(value);
    internal static string ScalarKey(object? value) => value == null ? "z" : value is string text ? "s" + text : value is bool flag ? flag ? "b1" : "b0" :
        value is DateTime date ? "d" + ((date.Ticks - 621355968000000000L) / 10000).ToString(CultureInfo.InvariantCulture) : "n" + CanopyNumericValues.FormatNumber(CanopyNumericValues.ToDouble(value));
    internal static string Key(string axis, IReadOnlyList<object?> path, int width = -1) {
        var key = axis;
        for (var index = 0; index < (width < 0 ? path.Count : width); index++) {
            var value = ScalarKey(path[index]); key += "|" + value.Length.ToString(CultureInfo.InvariantCulture) + ":" + value;
        }
        return key;
    }
    internal static CanopyCell? Cell(object? value) => value == null ? null : value is string text ? new CanopyCell(text) : value is bool flag ? new CanopyCell(flag) :
        value is DateTime date ? new CanopyCell(date) : new CanopyCell(CanopyNumericValues.ToDouble(value));
}
