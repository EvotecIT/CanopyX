using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>
/// Evaluates a grid's formatting rules for script-free output with the browser part's semantics: conditions, the
/// per-aspect first-match merge, stopIfTrue, bars, scales and bands. Automatic bounds come from the rows it is given.
/// </summary>
internal sealed class CanopyFormatEvaluator {
    private readonly List<(CanopyFormatRule Rule, Func<CanopyGridRow, bool>? Test)> _rules = new List<(CanopyFormatRule, Func<CanopyGridRow, bool>?)>();
    private readonly Dictionary<string, (double Min, double Max)?> _stats = new Dictionary<string, (double, double)?>(StringComparer.Ordinal);

    internal CanopyFormatEvaluator(CanopyDataGridView view, IEnumerable<CanopyGridRow> statsRows) {
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) columns[column.Id] = column;
        foreach (var rule in view.FormatRules) if (rule.Enabled) _rules.Add((rule, rule.When == null ? null : Compile(rule.When, columns)));
        var wanted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (rule, _) in _rules) if ((rule.Style.Bar != null || rule.Style.Scale != null) && rule.Column != null) wanted.Add(rule.Column);
        if (wanted.Count == 0) return;
        var bounds = new Dictionary<string, (double Min, double Max)>(StringComparer.Ordinal);
        foreach (var row in statsRows) foreach (var id in wanted) {
            if (!(Number(row, id) is double value)) continue;
            bounds[id] = bounds.TryGetValue(id, out var range) ? (Math.Min(range.Min, value), Math.Max(range.Max, value)) : (value, value);
        }
        foreach (var id in wanted) _stats[id] = bounds.TryGetValue(id, out var range) ? range : ((double, double)?)null;
    }

    internal bool IsEmpty => _rules.Count == 0;

    private static object? Raw(CanopyGridRow row, string id) => row.Cells.TryGetValue(id, out var cell) ? cell?.Value : null;

    private static double? Number(CanopyGridRow row, string id) => CanopyFormatValues.Coerce(Raw(row, id), CanopyFormatValueType.Number, null) as double?;

    private static Func<CanopyGridRow, bool> Compile(CanopyFormatCondition group, IDictionary<string, CanopyColumn> columns) {
        var tests = new List<Func<CanopyGridRow, bool>>();
        foreach (var predicate in group.Predicates) tests.Add(Compile(predicate, columns));
        foreach (var child in group.Groups) tests.Add(Compile(child, columns));
        if (group.Junction == CanopyFormatJunction.All) return row => tests.TrueForAll(test => test(row));
        if (group.Junction == CanopyFormatJunction.Any) return row => tests.Exists(test => test(row));
        return row => !tests.Exists(test => test(row));
    }

    private static Func<CanopyGridRow, bool> Compile(CanopyFormatPredicate predicate, IDictionary<string, CanopyColumn> columns) {
        var column = columns[predicate.Column];
        var other = predicate.ValueColumn;
        var op = predicate.Operator;
        var relative = op == CanopyFormatOperator.OlderThanDays || op == CanopyFormatOperator.WithinLastDays;
        var pattern = op == CanopyFormatOperator.Like || op == CanopyFormatOperator.NotLike || op == CanopyFormatOperator.Matches || op == CanopyFormatOperator.NotMatches
            ? CanopyFormatValues.Pattern(op, predicate.Values[0].Value as string ?? Convert.ToString(predicate.Values[0].Value, CultureInfo.InvariantCulture)!, predicate.CaseSensitive) : null;
        var operands = new List<object?>();
        foreach (var operand in predicate.Values) operands.Add(relative ? (double)CanopyFormatValues.Coerce(operand.Value, CanopyFormatValueType.Number, null)! * 86400000d : CanopyFormatValues.Read(operand.Value, predicate, column));
        int Order(object? a, object? b) => CanopyFormatValues.Compare(a, b, predicate);
        string Text(object value) => CanopyFormatValues.Text(value);
        return row => {
            var value = CanopyFormatValues.Read(Raw(row, column.Id), predicate, column);
            if (op == CanopyFormatOperator.IsNull) return value == null;
            if (value == null) return false;
            if (op == CanopyFormatOperator.IsNotNull) return true;
            var operand = other != null ? CanopyFormatValues.Read(Raw(row, other), predicate, column) : operands.Count > 0 ? operands[0] : null;
            if (operand == null && op != CanopyFormatOperator.In && op != CanopyFormatOperator.NotIn && pattern == null) return false;
            switch (op) {
                case CanopyFormatOperator.Equal: return CanopyFormatValues.Same(value, operand, predicate);
                case CanopyFormatOperator.NotEqual: return !CanopyFormatValues.Same(value, operand, predicate);
                case CanopyFormatOperator.GreaterThan: return Order(value, operand) > 0;
                case CanopyFormatOperator.GreaterThanOrEqual: return Order(value, operand) >= 0;
                case CanopyFormatOperator.LessThan: return Order(value, operand) < 0;
                case CanopyFormatOperator.LessThanOrEqual: return Order(value, operand) <= 0;
                case CanopyFormatOperator.In: return operands.Exists(item => CanopyFormatValues.Same(value, item, predicate));
                case CanopyFormatOperator.NotIn: return !operands.Exists(item => CanopyFormatValues.Same(value, item, predicate));
                case CanopyFormatOperator.Between: return Order(value, operand) >= 0 && Order(value, operands[1]) <= 0;
                case CanopyFormatOperator.BetweenExclusive: return Order(value, operand) > 0 && Order(value, operands[1]) < 0;
                case CanopyFormatOperator.Contains: return Text(value).IndexOf(Text(operand!), StringComparison.Ordinal) >= 0;
                case CanopyFormatOperator.NotContains: return Text(value).IndexOf(Text(operand!), StringComparison.Ordinal) < 0;
                case CanopyFormatOperator.StartsWith: return Text(value).StartsWith(Text(operand!), StringComparison.Ordinal);
                case CanopyFormatOperator.EndsWith: return Text(value).EndsWith(Text(operand!), StringComparison.Ordinal);
                case CanopyFormatOperator.Like: case CanopyFormatOperator.Matches: return Matches(pattern!, Text(value));
                case CanopyFormatOperator.NotLike: case CanopyFormatOperator.NotMatches: return !Matches(pattern!, Text(value));
                case CanopyFormatOperator.OlderThanDays: return value is double then && then < Now() - (double)operand!;
                case CanopyFormatOperator.WithinLastDays: { var now = Now(); return value is double at && at >= now - (double)operand! && at <= now; }
                default: return false;
            }
        };
    }

    private static bool Matches(CanopyNativePattern pattern, string text) {
        // JavaScript slice counts UTF-16 units too; the shared pattern grammar and timeout stay unchanged.
        if (text.Length > 4096) text = text.Substring(0, 4096);
        try { return pattern.IsMatch(text); } catch (System.Text.RegularExpressions.RegexMatchTimeoutException) { return false; }
    }

    private static double Now() => Math.Floor((DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds);

    /// <summary>The row's formatting, or null when no rule applies.</summary>
    internal CanopyFormatOutcome? Evaluate(CanopyGridRow row) {
        CanopyFormatPaint? rowPaint = null;
        Dictionary<string, CanopyFormatPaint>? cells = null;
        foreach (var (rule, test) in _rules) {
            if (test != null && !test(row)) continue;
            var paint = Resolve(rule, row);
            if (paint != null) {
                if (rule.Target == CanopyFormatTarget.Row) rowPaint = Merge(rowPaint, rule, paint);
                else foreach (var id in rule.Target == CanopyFormatTarget.Cell ? new[] { rule.Column! } : (IEnumerable<string>)rule.Columns) {
                    cells ??= new Dictionary<string, CanopyFormatPaint>(StringComparer.Ordinal);
                    cells[id] = Merge(cells.TryGetValue(id, out var existing) ? existing : null, rule, paint);
                }
            }
            if (rule.StopIfTrue) break;
        }
        return rowPaint == null && cells == null ? null : new CanopyFormatOutcome(rowPaint?.Finish(), cells);
    }

    private CanopyFormatPaint? Resolve(CanopyFormatRule rule, CanopyGridRow row) {
        var style = rule.Style;
        var paint = new CanopyFormatPaint { Tone = style.Tone, Emphasis = style.Emphasis == CanopyFormatEmphasis.Fill ? (CanopyFormatEmphasis?)null : style.Emphasis,
            Icon = style.Icon, Badge = style.Badge, Cue = style.Cue, ClassName = style.ClassName, Css = style.Css.Count > 0 ? style.Css : null };
        if (!style.DrawsValue) return paint;
        if (!(Number(row, rule.Column!) is double value)) return null;
        _stats.TryGetValue(rule.Column!, out var range);
        if (style.Bar != null) {
            var low = style.Bar.Minimum ?? Math.Min(0, range?.Min ?? 0);
            var high = style.Bar.Maximum ?? range?.Max ?? low + 1;
            paint.Bar = high > low ? Math.Max(0, Math.Min(1, (value - low) / (high - low))) : 0;
            paint.BarTone = style.Bar.Tone.Name != null ? style.Bar.Tone : style.Tone.Name != null ? style.Tone : CanopyTone.Info;
            paint.BarValue = style.Bar.ShowValue; paint.Tone = default;
        } else if (style.Scale != null) {
            var stops = new List<(double At, CanopyTone Tone)>();
            foreach (var stop in style.Scale.Stops) {
                double? at = stop.Type == CanopyFormatScaleStopType.Number ? stop.Value : range == null ? null : stop.Type == CanopyFormatScaleStopType.Minimum ? range.Value.Min :
                    stop.Type == CanopyFormatScaleStopType.Maximum ? range.Value.Max : range.Value.Min + (range.Value.Max - range.Value.Min) * stop.Value!.Value / 100;
                if (at.HasValue) stops.Add((at.Value, stop.Tone));
            }
            if (stops.Count < 2) return null;
            stops.Sort((a, b) => a.At.CompareTo(b.At));
            var upper = stops.FindIndex(stop => value <= stop.At);
            var to = upper < 0 ? stops.Count - 1 : Math.Max(1, upper);
            var from = stops[to - 1];
            var next = stops[to];
            paint.ScaleFrom = from.Tone; paint.ScaleTo = next.Tone; paint.Tone = default;
            paint.ScaleWeight = next.At > from.At ? Math.Max(0, Math.Min(1, (value - from.At) / (next.At - from.At))) : 1;
        } else {
            CanopyFormatBand? band = null;
            foreach (var item in style.Bands) if (!item.UpperBound.HasValue || value <= item.UpperBound.Value) { band = item; break; }
            if (band == null) return null;
            paint.Tone = band.Tone; paint.Icon = band.Icon ?? style.Icon; paint.Band = band.Label;
        }
        return paint;
    }

    private static CanopyFormatPaint Merge(CanopyFormatPaint? into, CanopyFormatRule rule, CanopyFormatPaint paint) {
        var target = into ?? new CanopyFormatPaint();
        target.Absorb(paint);
        target.Rules.Add(rule.Id);
        var description = rule.Description ?? rule.Label ?? rule.Id;
        if (!target.Descriptions.Contains(description)) target.Descriptions.Add(description);
        if (paint.Band != null && !target.Descriptions.Contains(paint.Band)) target.Descriptions.Add(paint.Band);
        target.Details |= rule.Details;
        return target;
    }
}
