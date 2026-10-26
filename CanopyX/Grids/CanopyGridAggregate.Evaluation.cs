using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

public sealed partial class CanopyGridAggregate {
    /// <summary>Computes a built-in aggregate from raw cell values, ignoring display text and missing values.</summary>
    /// <param name="values">The accepted records' cells. Null cells and null raw values are missing.</param>
    /// <returns>A count, or a numeric result; numeric operations over no values return null.</returns>
    /// <exception cref="InvalidOperationException">The aggregate is custom, a numeric operand is invalid, or the result exceeds the protocol's finite safe magnitude.</exception>
    public double? Evaluate(IEnumerable<CanopyCell?> values) {
        if (values == null) throw new ArgumentNullException(nameof(values));
        if (Operation == CanopyGridAggregateOperation.Custom) throw new InvalidOperationException("A named custom aggregate requires its host or plugin.");
        var distinct = Operation == CanopyGridAggregateOperation.DistinctCount ? new HashSet<string>(StringComparer.Ordinal) : null;
        int count = 0;
        double sum = 0, compensation = 0, minimum = double.MaxValue, maximum = double.MinValue;
        foreach (var cell in values) {
            var raw = CanopyGridValues.Normalize(cell?.Value);
            if (raw == null) continue;
            count++;
            if (distinct != null) {
                var real = raw is long || raw is decimal || raw is double ? CanopyNumericValues.ToDouble(raw) : 0d;
                var key = raw is string text ? "s:" + text : raw is bool flag ? "b:" + flag : raw is DateTime date ?
                    "d:" + (date.Ticks / TimeSpan.TicksPerMillisecond).ToString(CultureInfo.InvariantCulture) :
                    "n:" + (real == 0 ? "0" : real.ToString("R", CultureInfo.InvariantCulture));
                distinct.Add(key); continue;
            }
            if (Operation == CanopyGridAggregateOperation.Count) continue;
            if (!(raw is long) && !(raw is decimal) && !(raw is double)) throw new InvalidOperationException("A numeric aggregate requires numeric values.");
            var number = CanopyNumericValues.ToDouble(raw);
            if (double.IsNaN(number) || double.IsInfinity(number) || Math.Abs(number) > 9007199254740991d) throw new InvalidOperationException("Aggregate operands require finite safe numeric values.");
            var total = sum + number;
            compensation += Math.Abs(sum) >= Math.Abs(number) ? sum - total + number : number - total + sum;
            sum = total; minimum = Math.Min(minimum, number); maximum = Math.Max(maximum, number);
        }
        double? result = Operation == CanopyGridAggregateOperation.Count ? count : distinct != null ? distinct.Count : count == 0 ? (double?)null :
            Operation == CanopyGridAggregateOperation.Sum ? sum + compensation : Operation == CanopyGridAggregateOperation.Average ? (sum + compensation) / count :
            Operation == CanopyGridAggregateOperation.Minimum ? minimum : maximum;
        if (result.HasValue && (double.IsNaN(result.Value) || double.IsInfinity(result.Value) || Math.Abs(result.Value) > 9007199254740991d))
            throw new InvalidOperationException("An aggregate result must be a finite number within the safe magnitude.");
        return result;
    }
}
