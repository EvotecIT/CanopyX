using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>What one record request reads with: the caller's scoped grid query (or, in memory, the identities of the records
/// the caller may read), the execution settings and the text bound.</summary>
internal sealed class RecordReadContext<T> {
    private readonly Func<ISet<string>>? _visible;
    private ISet<string>? _visibleKeys;

    internal RecordReadContext(IQueryable<T>? source, Func<ISet<string>>? visible, LambdaExpression gridKey, bool memory, CanopyQueryExecutor? executor, int maxText) {
        Source = source; _visible = visible; GridKey = gridKey; Memory = memory; Executor = executor ?? CanopyQueryExecutor.Default; MaxText = maxText;
    }

    /// <summary>The grid's query for the caller (queryable providers).</summary>
    internal IQueryable<T>? Source { get; }

    /// <summary>The identities of the records the caller may read (the in-memory reference), read once per request.</summary>
    internal ISet<string> Visible => _visibleKeys ??= (_visible ?? throw new InvalidOperationException("No visible records."))();

    /// <summary>The column map's key.</summary>
    internal LambdaExpression GridKey { get; }

    internal bool Memory { get; }

    internal CanopyQueryExecutor Executor { get; }

    internal int MaxText { get; }

    /// <summary><c>source.Any(visible =&gt; key(visible) == key)</c>: whether a key belongs to a record of the caller's scoped query.</summary>
    internal Expression Exists(Expression key) {
        var visible = Expression.Parameter(typeof(T), "visible");
        var (left, right) = RecordScope.SameType(ExpressionTools.Bind(GridKey, visible, Memory), key);
        var test = Expression.Lambda<Func<T, bool>>(Expression.Equal(left, right), visible);
        return Expression.Call(typeof(Queryable), nameof(Queryable.Any), new[] { typeof(T) }, (Source ?? throw new InvalidOperationException("No scoped source.")).Expression, Expression.Quote(test));
    }
}

internal static class RecordScope {
    /// <summary>Two key expressions in one comparable type: equal types as they are, otherwise both as the nullable underlying type.</summary>
    internal static (Expression Left, Expression Right) SameType(Expression left, Expression right) {
        if (left.Type == right.Type) return (left, right);
        var type = ExpressionTools.Underlying(left.Type);
        if (type != ExpressionTools.Underlying(right.Type)) throw new InvalidOperationException("A key compared with the grid's key must have the grid key's type.");
        var nullable = type.IsValueType ? typeof(Nullable<>).MakeGenericType(type) : type;
        return (left.Type == nullable ? left : Expression.Convert(left, nullable), right.Type == nullable ? right : Expression.Convert(right, nullable));
    }

    /// <summary>Whether two key types compare: the same underlying type.</summary>
    internal static bool Comparable(Type left, Type right) => ExpressionTools.Underlying(left) == ExpressionTools.Underlying(right);
}
