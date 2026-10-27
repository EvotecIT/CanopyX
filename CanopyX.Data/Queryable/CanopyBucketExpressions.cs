using System;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Builds provider-translatable numeric bucket keys from mapped numeric or local calendar values.</summary>
internal static class CanopyBucketExpressions {
    internal static Expression Key(Expression input, CanopyBucket bucket) {
        var nullable = ExpressionTools.IsNullable(input.Type);
        Expression value = nullable ? Expression.Property(input, "Value") : input;
        Expression key;
        if (bucket.Kind >= CanopyBucketKind.Width) {
            value = Expression.Convert(value, typeof(double));
            if (bucket.Kind == CanopyBucketKind.Width) key = Expression.Call(typeof(Math).GetMethod(nameof(Math.Floor), new[] { typeof(double) })!,
                Expression.Divide(Expression.Subtract(value, Expression.Constant(bucket.Origin)), Expression.Constant(bucket.Width)));
            else {
                key = Expression.Constant((double)bucket.Edges.Count);
                for (var i = bucket.Edges.Count - 1; i >= 0; i--)
                    key = Expression.Condition(Expression.LessThan(value, Expression.Constant(bucket.Edges[i])), Expression.Constant((double)i), key);
            }
        } else {
            if (value.Type == typeof(DateTimeOffset)) value = Expression.Property(value, nameof(DateTimeOffset.UtcDateTime));
            if (value.Type != typeof(DateTime)) throw new CanopyRequestException(CanopyRequestError.Unsupported, "Calendar buckets need a mapped DateTime value.");
            Expression Part(string name) => Expression.Property(value, name);
            Expression Add(Expression left, int right) => Expression.Add(left, Expression.Constant(right));
            Expression Divide(Expression left, int right) => Expression.Divide(left, Expression.Constant(right));
            Expression Multiply(Expression left, int right) => Expression.Multiply(left, Expression.Constant(right));
            Expression Mod(Expression left, int right) => Expression.Modulo(left, Expression.Constant(right));
            var year = Part(nameof(DateTime.Year));
            var month = Part(nameof(DateTime.Month));
            var previousYear = Add(year, -1);
            // Gregorian day ordinal using only date parts and integer arithmetic, translatable by relational providers.
            var leap = Expression.AndAlso(Expression.Equal(Mod(year, 4), Expression.Constant(0)), Expression.OrElse(
                Expression.NotEqual(Mod(year, 100), Expression.Constant(0)), Expression.Equal(Mod(year, 400), Expression.Constant(0))));
            var adjustment = Expression.Condition(Expression.LessThanOrEqual(month, Expression.Constant(2)), Expression.Constant(0),
                Expression.Condition(leap, Expression.Constant(-1), Expression.Constant(-2)));
            var dayInYear = Expression.Add(Expression.Add(Divide(Add(Multiply(month, 367), -362), 12), adjustment), Add(Part(nameof(DateTime.Day)), -1));
            var ordinal = Expression.Add(Expression.Add(Expression.Subtract(Expression.Add(Multiply(previousYear, 365), Divide(previousYear, 4)),
                Divide(previousYear, 100)), Divide(previousYear, 400)), dayInYear);
            switch (bucket.Kind) {
                case CanopyBucketKind.Day: key = ordinal; break;
                case CanopyBucketKind.Week:
                    key = Expression.Call(typeof(Math).GetMethod(nameof(Math.Floor), new[] { typeof(double) })!,
                        Expression.Divide(Expression.Convert(Add(ordinal, -((int)bucket.FirstWeekday + 6) % 7), typeof(double)), Expression.Constant(7d))); break;
                case CanopyBucketKind.Month: key = Expression.Add(Multiply(previousYear, 12), Add(month, -1)); break;
                case CanopyBucketKind.Quarter: key = Expression.Add(Multiply(previousYear, 4), Divide(Add(month, -1), 3)); break;
                case CanopyBucketKind.Year: key = year; break;
                case CanopyBucketKind.Hour: key = Part(nameof(DateTime.Hour)); break;
                default: key = Mod(Add(ordinal, 8 - (int)bucket.FirstWeekday), 7); break;
            }
        }
        var converted = Expression.Convert(key, typeof(double?));
        return nullable ? Expression.Condition(ExpressionTools.IsNull(input), Expression.Constant(null, typeof(double?)), converted) : converted;
    }
}
