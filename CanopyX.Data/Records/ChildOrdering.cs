using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>
/// The order of a record's child rows (collection rows, timeline events, changes): each order key with missing values last in
/// both directions, then the child key ascending. Stored values compare as the store orders them: numbers and dates by value,
/// booleans false first, enumerations by their underlying number and text in ordinal (binary) order.
/// </summary>
internal static class ChildOrdering {
    private static readonly MethodInfo[] OrderMethods = typeof(Queryable).GetMethods().Where(method =>
        method.Name == nameof(Queryable.OrderBy) || method.Name == nameof(Queryable.OrderByDescending) ||
        method.Name == nameof(Queryable.ThenBy) || method.Name == nameof(Queryable.ThenByDescending)).ToArray();

    /// <summary>Orders a child query. In memory, text keys compare ordinally, as a binary collation does.</summary>
    internal static IQueryable<TChild> Apply<TChild>(IQueryable<TChild> source, ParameterExpression child, IReadOnlyList<(Expression Body, bool Descending)> keys,
        Expression key, bool memory) {
        var first = true;
        foreach (var (body, descending) in keys) {
            if (ExpressionTools.IsNullable(body.Type)) {
                source = Order(source, child, Expression.Condition(ExpressionTools.IsNull(body), Expression.Constant(1), Expression.Constant(0)), false, null, first);
                first = false;
            }
            source = Order(source, child, body, descending, memory && body.Type == typeof(string) ? StringComparer.Ordinal : null, first);
            first = false;
        }
        return Order(source, child, key, false, memory && key.Type == typeof(string) ? StringComparer.Ordinal : null, first);
    }

    private static IQueryable<TChild> Order<TChild>(IQueryable<TChild> source, ParameterExpression child, Expression key, bool descending, object? comparer, bool first) {
        var name = first ? descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy)
            : descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy);
        var method = OrderMethods.Single(candidate => candidate.Name == name && candidate.GetParameters().Length == (comparer == null ? 2 : 3))
            .MakeGenericMethod(typeof(TChild), key.Type);
        var lambda = Expression.Lambda(key, child);
        var arguments = comparer == null ? new object[] { source, lambda } : new object[] { source, lambda, comparer };
        return (IQueryable<TChild>)method.Invoke(null, arguments)!;
    }

    /// <summary>The same order over values read in memory: each row holds its order values, then its child key.</summary>
    internal static int Compare(object?[] left, object?[] right, IReadOnlyList<bool> descending) {
        for (var i = 0; i < left.Length; i++) {
            var a = left[i];
            var b = right[i];
            if (a == null || b == null) {
                if (a == null && b == null) continue;
                return a == null ? 1 : -1;
            }
            var compared = a is string x && b is string y ? string.CompareOrdinal(x, y) : Comparer.Default.Compare(a, b);
            if (compared != 0) return i < descending.Count && descending[i] ? -Math.Sign(compared) : Math.Sign(compared);
        }
        return 0;
    }
}
