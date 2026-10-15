using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    private Expression Condition(CanopyFilterCondition condition) {
        var mapped = Map.Get(condition.Column.Id);
        var value = _values[condition.Column.Id];
        var nullable = ExpressionTools.IsNullable(value.Type);
        var op = condition.Operator;
        if (op == CanopyGridFilterOperator.IsNull) return nullable ? ExpressionTools.IsNull(value) : Expression.Constant(false);
        if (op == CanopyGridFilterOperator.IsNotNull) return nullable ? ExpressionTools.NotNull(value) : Expression.Constant(true);
        var guard = nullable ? ExpressionTools.NotNull(value) : null;
        Expression? test;
        switch (mapped.Shape) {
            case ValueShape.Text: test = TextCondition(value, op, condition.Values, guard); break;
            case ValueShape.Boolean:
            case ValueShape.Enum:
                return Domain(value, mapped.Shape, member => ProtocolSemantics.Matches(member, CanopyColumnKind.Text, op, condition.Values));
            case ValueShape.Integer: test = IntegerCondition(value, op, condition.Values, guard); break;
            case ValueShape.Real:
            case ValueShape.Decimal:
                // Request numbers already are binary64. Narrowing an operand to float/decimal changes boundaries
                // that the browser sees, so promote the stored value instead (also a portable SQL CAST).
                var number = Expression.Convert(value, nullable ? typeof(double?) : typeof(double));
                test = Compare(number, op, condition.Values); break;
            default: test = DateCondition(value, mapped.Shape, op, condition.Values, guard); break;
        }
        if (test is ConstantExpression constant && constant.Value is bool flag) return flag ? (Expression?)guard ?? Expression.Constant(true) : Expression.Constant(false);
        return guard == null ? test : Expression.AndAlso(guard, test);
    }

    private Expression TextCondition(Expression value, CanopyGridFilterOperator op, IReadOnlyList<object> operands, Expression? guard) {
        var texts = operands.OfType<string>().Select(text => ExpressionTools.FoldOperand(text, Comparison)).ToList();
        var folded = ExpressionTools.Fold(value, Comparison);
        switch (op) {
            case CanopyGridFilterOperator.Equal:
                return texts.Count == 0 ? Expression.Constant(false) : Expression.Equal(folded, ExpressionTools.Parameter(texts[0], typeof(string)));
            case CanopyGridFilterOperator.NotEqual:
                // A text value never equals a boolean operand.
                return texts.Count == 0 ? Expression.Constant(true) : Expression.NotEqual(folded, ExpressionTools.Parameter(texts[0], typeof(string)));
            case CanopyGridFilterOperator.In:
                return texts.Count == 0 ? Expression.Constant(false) : ExpressionTools.InList(folded, texts);
            case CanopyGridFilterOperator.Contains:
                return Expression.Call(folded, ExpressionTools.ContainsMethod, ExpressionTools.Parameter(texts[0], typeof(string)));
            default:
                return Comparison == CanopyTextComparison.Canonical
                    ? Expression.Call(folded, ExpressionTools.StartsWithOrdinalMethod, ExpressionTools.Parameter(texts[0], typeof(string)), Expression.Constant(StringComparison.Ordinal))
                    : Expression.Call(folded, ExpressionTools.StartsWithMethod, ExpressionTools.Parameter(texts[0], typeof(string)));
        }
    }

    /// <summary>Integer columns compare with whole bounds: a fractional or out-of-range operand narrows to the values it can still match.</summary>
    private Expression IntegerCondition(Expression value, CanopyGridFilterOperator op, IReadOnlyList<object> operands, Expression? guard) {
        var type = ExpressionTools.Underlying(value.Type);
        var (minimum, maximum) = ValueShapes.Range(type);
        bool Representable(double number) => number == Math.Floor(number) && number >= minimum && number <= maximum;
        object Whole(double number) => Convert.ChangeType((long)number, type, CultureInfo.InvariantCulture);
        var operand = (double)operands[0];
        switch (op) {
            case CanopyGridFilterOperator.Equal:
                return Representable(operand) ? Compare(value, op, new[] { Whole(operand) }) : Expression.Constant(false);
            case CanopyGridFilterOperator.NotEqual:
                return Representable(operand) ? Compare(value, op, new[] { Whole(operand) }) : Expression.Constant(true);
            case CanopyGridFilterOperator.In:
                var members = operands.Select(item => (double)item).Where(Representable).Distinct().Select(Whole).ToList();
                return members.Count == 0 ? Expression.Constant(false) : Compare(value, op, members);
            case CanopyGridFilterOperator.GreaterThan:
                var above = Math.Floor(operand);
                return above < minimum ? Expression.Constant(true) : above >= maximum ? Expression.Constant(false) : Compare(value, op, new[] { Whole(above) });
            case CanopyGridFilterOperator.GreaterThanOrEqual:
                var from = Math.Ceiling(operand);
                return from <= minimum ? Expression.Constant(true) : from > maximum ? Expression.Constant(false) : Compare(value, op, new[] { Whole(from) });
            case CanopyGridFilterOperator.LessThan:
                var below = Math.Ceiling(operand);
                return below > maximum ? Expression.Constant(true) : below <= minimum ? Expression.Constant(false) : Compare(value, op, new[] { Whole(below) });
            default:
                var to = Math.Floor(operand);
                return to >= maximum ? Expression.Constant(true) : to < minimum ? Expression.Constant(false) : Compare(value, op, new[] { Whole(to) });
        }
    }

    private static Expression Compare(Expression value, CanopyGridFilterOperator op, IReadOnlyList<object> operands) {
        if (op == CanopyGridFilterOperator.In) {
            Expression? any = null;
            if (operands.Count > 8) {
                var item = value.Type == ExpressionTools.Underlying(value.Type) ? value : Expression.Convert(value, ExpressionTools.Underlying(value.Type));
                return ExpressionTools.InList(item, operands);
            }
            foreach (var operand in operands) any = ExpressionTools.Or(any, Expression.Equal(value, ExpressionTools.Parameter(operand, value.Type)));
            return any!;
        }
        var parameter = ExpressionTools.Parameter(operands[0], value.Type);
        return op switch {
            CanopyGridFilterOperator.Equal => Expression.Equal(value, parameter),
            CanopyGridFilterOperator.NotEqual => Expression.NotEqual(value, parameter),
            CanopyGridFilterOperator.GreaterThan => Expression.GreaterThan(value, parameter),
            CanopyGridFilterOperator.GreaterThanOrEqual => Expression.GreaterThanOrEqual(value, parameter),
            CanopyGridFilterOperator.LessThan => Expression.LessThan(value, parameter),
            CanopyGridFilterOperator.LessThanOrEqual => Expression.LessThanOrEqual(value, parameter),
            _ => throw new ArgumentOutOfRangeException(nameof(op))
        };
    }

    /// <summary>Dates compare at millisecond precision: every operator becomes half-open bounds <c>[from, to)</c> on the stored instant.</summary>
    private Expression DateCondition(Expression value, ValueShape shape, CanopyGridFilterOperator op, IReadOnlyList<object> operands, Expression? guard) {
        var tick = TimeSpan.FromMilliseconds(1);
        var instant = (DateTime)operands[0];
        switch (op) {
            case CanopyGridFilterOperator.Equal: return Expression.AndAlso(AtLeast(value, shape, instant), Before(value, shape, instant + tick));
            case CanopyGridFilterOperator.NotEqual: return Expression.OrElse(Before(value, shape, instant), AtLeast(value, shape, instant + tick));
            case CanopyGridFilterOperator.GreaterThan: return AtLeast(value, shape, instant + tick);
            case CanopyGridFilterOperator.GreaterThanOrEqual: return AtLeast(value, shape, instant);
            case CanopyGridFilterOperator.LessThan: return Before(value, shape, instant);
            case CanopyGridFilterOperator.LessThanOrEqual: return Before(value, shape, instant + tick);
            default:
                Expression? any = null;
                foreach (var item in operands.Cast<DateTime>().Distinct())
                    any = ExpressionTools.Or(any, Expression.AndAlso(AtLeast(value, shape, item), Before(value, shape, item + tick)));
                return any!;
        }
    }

    private static Expression AtLeast(Expression value, ValueShape shape, DateTime from) => Expression.GreaterThanOrEqual(value, Bound(value, shape, from));

    private static Expression Before(Expression value, ValueShape shape, DateTime to) => Expression.LessThan(value, Bound(value, shape, to));

    private static Expression Bound(Expression value, ValueShape shape, DateTime instant) {
        instant = DateTime.SpecifyKind(instant, DateTimeKind.Utc);
        switch (shape) {
            case ValueShape.DateTimeOffset: return ExpressionTools.Parameter(new DateTimeOffset(instant, TimeSpan.Zero), value.Type);
            case ValueShape.DateOnly:
                // A date-only value stands for midnight UTC, so the first date at or after an instant is its ceiling day.
                var day = instant.TimeOfDay == TimeSpan.Zero ? instant.Date : instant.Date.AddDays(1);
                var dateOnly = ExpressionTools.Underlying(value.Type).GetMethod("FromDateTime", new[] { typeof(DateTime) })!.Invoke(null, new object[] { day });
                return ExpressionTools.Parameter(dateOnly, value.Type);
            default: return ExpressionTools.Parameter(instant, value.Type);
        }
    }
}
