using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    private static readonly MethodInfo[] OrderMethods = typeof(Queryable).GetMethods().Where(method =>
        method.Name == nameof(Queryable.OrderBy) || method.Name == nameof(Queryable.OrderByDescending) ||
        method.Name == nameof(Queryable.ThenBy) || method.Name == nameof(Queryable.ThenByDescending)).ToArray();

    /// <summary>Orders by the sort keys (missing values last in both directions), then by the record key.</summary>
    internal IQueryable<T> Order(IQueryable<T> source, IEnumerable<CanopySortKey> sort, Expression? lead = null) {
        ValidateOrder(sort);
        var first = true;
        if (lead != null) {
            source = ApplyOrder(source, lead, false, null, true);
            first = false;
        }
        foreach (var key in sort) {
            foreach (var (expression, descending, comparer) in SortKeys(key)) {
                source = ApplyOrder(source, expression, descending, comparer, first);
                first = false;
            }
        }
        var keyComparer = Comparison == CanopyTextComparison.Canonical && Key.Type == typeof(string) ? StringComparer.Ordinal : null;
        return ApplyOrder(source, Key, false, keyComparer, first);
    }

    /// <summary>Rejects unavailable date ordering before a page or export starts reading records.</summary>
    internal void ValidateOrder(IEnumerable<CanopySortKey> sort) {
        if (_memory) return;
        foreach (var key in sort) {
            var shape = Map.Get(key.Column.Id).Shape;
            if (!_sorts.ContainsKey(key.Column.Id) && (shape == ValueShape.DateTime || shape == ValueShape.DateTimeOffset))
                throw new CanopyRequestException(CanopyRequestError.Unsupported,
                    "Database date ordering requires an explicit SortBy expression at millisecond precision; map a UTC millisecond key or a date value stored at whole milliseconds.");
        }
    }

    private IEnumerable<(Expression Expression, bool Descending, object? Comparer)> SortKeys(CanopySortKey key) {
        var mapped = Map.Get(key.Column.Id);
        var custom = _sorts.TryGetValue(key.Column.Id, out var sortBy);
        var value = custom ? sortBy! : _values[key.Column.Id];
        if (ExpressionTools.IsNullable(value.Type) && !_neverNull.Contains(key.Column.Id))
            yield return (Expression.Condition(ExpressionTools.IsNull(value), Expression.Constant(1), Expression.Constant(0)), false, null);
        if (custom) {
            yield return (value, key.Descending, Comparison == CanopyTextComparison.Canonical && value.Type == typeof(string) ? StringComparer.Ordinal : null);
            yield break;
        }
        var canonical = Comparison == CanopyTextComparison.Canonical;
        if (mapped.Shape == ValueShape.DateTime || mapped.Shape == ValueShape.DateTimeOffset) {
            var method = typeof(QueryTranslator<T>).GetMethod(nameof(DateMilliseconds), BindingFlags.NonPublic | BindingFlags.Static)!;
            yield return (Expression.Call(method, Expression.Convert(value, typeof(object))), key.Descending, null);
            yield break;
        }
        if (mapped.Shape == ValueShape.Real || mapped.Shape == ValueShape.Decimal) {
            yield return (Binary64(value), key.Descending, null);
            yield break;
        }
        if (mapped.Shape == ValueShape.Enum) {
            var type = ExpressionTools.Underlying(value.Type);
            if (canonical) {
                var plain = value.Type == type ? value : Expression.Convert(value, type);
                Expression name = Expression.Call(typeof(CanopyDataValues).GetMethod(nameof(CanopyDataValues.EnumText))!, Expression.Convert(plain, typeof(Enum)));
                if (value.Type != type) name = Expression.Condition(ExpressionTools.IsNull(value), Expression.Constant(null, typeof(string)), name);
                yield return (name, key.Descending, StringComparer.Ordinal);
            } else {
                // Enumerations sort by their raw text (EnumMember value or name); the database sees a rank expression, one rank per text.
                var texts = EnumDomains.Members(type).Cast<Enum>().GroupBy(member => CanopyDataValues.EnumText(member), StringComparer.Ordinal)
                    .OrderBy(group => group.Key, StringComparer.Ordinal).ToList();
                yield return (Rank(value, texts.Select(group => group.Select(member => (Expression)Expression.Equal(value, ExpressionTools.Parameter(member, value.Type)))
                    .Aggregate(Expression.OrElse)).ToList()), key.Descending, null);
            }
            yield break;
        }
        if (mapped.Shape == ValueShape.Text) {
            var ordering = key.Column.Ordering;
            if (canonical) {
                yield return (value, key.Descending, (IComparer<string>?)ordering ?? StringComparer.Ordinal);
                yield break;
            }
            if (ordering != null && ordering.Categories.Count > 0) {
                var folded = ordering.Order == CanopyGridTextOrder.FoldedOrdinal || ordering.Order == CanopyGridTextOrder.FoldedNatural;
                var comparison = folded ? CanopyTextComparison.Lowercase : CanopyTextComparison.Collation;
                var subject = ExpressionTools.Fold(value, comparison);
                yield return (Rank(value, ordering.Categories.Select(category => (Expression)Expression.Equal(subject,
                    ExpressionTools.Parameter(ExpressionTools.FoldOperand(category, comparison), typeof(string)))).ToList()), key.Descending, null);
            }
        }
        yield return (value, key.Descending, null);
    }

    private static long? DateMilliseconds(object? value) => CanopyDataValues.Normalize(value) is DateTime date
        ? date.Ticks / TimeSpan.TicksPerMillisecond : (long?)null;

    internal static Expression Rank(Expression value, IReadOnlyList<Expression> tests) {
        Expression rank = Expression.Constant(tests.Count);
        for (var i = tests.Count - 1; i >= 0; i--) rank = Expression.Condition(tests[i], Expression.Constant(i), rank);
        return rank;
    }

    private IQueryable<T> ApplyOrder(IQueryable<T> source, Expression key, bool descending, object? comparer, bool first) {
        var name = first ? descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy)
            : descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy);
        var lambda = Expression.Lambda(key, Row);
        var method = OrderMethods.Single(candidate => candidate.Name == name && candidate.GetParameters().Length == (comparer == null ? 2 : 3))
            .MakeGenericMethod(typeof(T), key.Type);
        var arguments = comparer == null ? new object[] { source, lambda } : new object[] { source, lambda, comparer };
        return (IQueryable<T>)method.Invoke(null, arguments)!;
    }

    /// <summary>Projects the key and the given columns into an object array, so the store selects only those values.</summary>
    internal Expression<Func<T, object?[]>> Projection(IEnumerable<string> columns) {
        var items = new List<Expression> { Expression.Convert(Key, typeof(object)) };
        foreach (var id in columns) items.Add(Expression.Convert(_values[id], typeof(object)));
        return Expression.Lambda<Func<T, object?[]>>(Expression.NewArrayInit(typeof(object), items), Row);
    }

    internal CanopyGridRow ToRow(object?[] values, IReadOnlyList<string> columns) {
        var row = new CanopyGridRow(CanopyDataValues.FormatId(values[0]));
        for (var i = 0; i < columns.Count; i++) {
            var mapped = Map.Get(columns[i]);
            var raw = values[i + 1];
            // Finite normalization can yield null for a nonnullable real member. Do not invoke a typed formatter with
            // default(float/double), which would manufacture a displayed zero for a missing value.
            var missingReal = raw == null && (mapped.Value.ReturnType == typeof(float) || mapped.Value.ReturnType == typeof(double));
            row.Cells[columns[i]] = (mapped.Format != null && !missingReal ? mapped.Format(raw) : CanopyDataValues.ToCell(raw))!;
        }
        Map.Decorator?.Invoke(row);
        return row;
    }

}
