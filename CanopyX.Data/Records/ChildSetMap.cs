using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>
/// A field read through the child rows a navigation of the record reaches. Child rows are always read through the record the
/// caller's scoped query found (<c>scoped.SelectMany(items)</c>), never from a table of their own, so they cannot bypass the scope.
/// </summary>
internal sealed class ChildSetMap<T, TChild> : RecordChildMap<T> {
    private readonly Expression<Func<T, IEnumerable<TChild>>> _items;
    private readonly ChildSpec<TChild> _spec;
    private readonly Lazy<Compiled> _compiled;

    internal ChildSetMap(string id, Expression<Func<T, IEnumerable<TChild>>> items, ChildSpec<TChild> spec) : base(id) {
        _items = items;
        _spec = spec;
        _compiled = new Lazy<Compiled>(Compile, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    internal override bool Collection => _spec.Collection;

    internal override int Size => _spec.Size;

    internal override async Task<CanopyCell?> QueryAsync(IQueryable<T> scoped, bool memory, int offset, int take, bool page, CanopyQueryExecutor executor,
        CancellationToken cancellationToken) {
        var children = scoped.SelectMany(Items(memory));
        int? total = null;
        if (_spec.Collection) total = await executor.CountAsync(children, cancellationToken).ConfigureAwait(false);
        var rows = new List<object?[]>();
        if (take > 0 && (total == null || offset < total)) {
            var child = Expression.Parameter(typeof(TChild), "child");
            var keys = _spec.Orders.Select(order => (ExpressionTools.Bind(order.Expression, child, memory), order.Descending)).ToList();
            var ordered = ChildOrdering.Apply(children, child, keys, ExpressionTools.Bind(_spec.Key, child, memory), memory);
            if (offset > 0) ordered = ordered.Skip(offset);
            var parts = new List<Expression> { Boxed(_spec.Key, child, memory) };
            foreach (var value in _spec.Values) parts.Add(Boxed(value, child, memory));
            var projection = Expression.Lambda<Func<TChild, object?[]>>(Expression.NewArrayInit(typeof(object), parts), child);
            rows = await executor.ToListAsync(ordered.Take(take).Select(projection), cancellationToken).ConfigureAwait(false);
        }
        return Result(rows, total, page);
    }

    internal override CanopyCell? Evaluate(T record, int offset, int take, bool page) {
        var compiled = _compiled.Value;
        var children = (compiled.Items(record) ?? Enumerable.Empty<TChild>()).ToList();
        int? total = _spec.Collection ? children.Count : (int?)null;
        var descending = _spec.Orders.Select(order => order.Descending).ToList();
        var keyed = children.Select(child => (Child: child, Keys: compiled.Orders.Select(order => order(child)).Concat(new[] { compiled.Key(child) }).ToArray())).ToList();
        // A stable sort over a total order: the child key is unique, so equal order keys are decided by it.
        var window = keyed.OrderBy(item => item.Keys, Comparer<object?[]>.Create((left, right) => ChildOrdering.Compare(left, right, descending)))
            .Skip(offset).Take(take);
        var rows = window.Select(item => new[] { compiled.Key(item.Child) }.Concat(compiled.Values.Select(value => value(item.Child))).ToArray()).ToList();
        return Result(rows, total, page);
    }

    private CanopyCell? Result(List<object?[]> rows, int? total, bool page) {
        if (!page && rows.Count == 0) return null;
        return _spec.Build(rows, total);
    }

    /// <summary>The navigation; in memory a missing collection or reference on the way is an empty collection, as a database join is.</summary>
    private Expression<Func<T, IEnumerable<TChild>>> Items(bool memory) {
        if (!memory) return _items;
        var record = Expression.Parameter(typeof(T), "record");
        var body = ExpressionTools.Bind(_items, record, true);
        if (body.Type != typeof(IEnumerable<TChild>)) body = Expression.Convert(body, typeof(IEnumerable<TChild>));
        return Expression.Lambda<Func<T, IEnumerable<TChild>>>(Expression.Coalesce(body, Expression.Constant(Array.Empty<TChild>(), typeof(IEnumerable<TChild>))), record);
    }

    private static Expression Boxed(LambdaExpression lambda, ParameterExpression child, bool memory) => Expression.Convert(ExpressionTools.Bind(lambda, child, memory), typeof(object));

    private Compiled Compile() {
        var record = Expression.Parameter(typeof(T), "record");
        var items = Expression.Lambda<Func<T, IEnumerable<TChild>?>>(Expression.Convert(ExpressionTools.Bind(_items, record, true), typeof(IEnumerable<TChild>)), record).Compile();
        Func<TChild, object?> Getter(LambdaExpression lambda) {
            var child = Expression.Parameter(typeof(TChild), "child");
            return Expression.Lambda<Func<TChild, object?>>(Boxed(lambda, child, true), child).Compile();
        }
        return new Compiled(items, Getter(_spec.Key), _spec.Orders.Select(order => Getter(order.Expression)).ToArray(), _spec.Values.Select(Getter).ToArray());
    }

    private sealed class Compiled {
        internal Compiled(Func<T, IEnumerable<TChild>?> items, Func<TChild, object?> key, Func<TChild, object?>[] orders, Func<TChild, object?>[] values) {
            Items = items; Key = key; Orders = orders; Values = values;
        }
        internal Func<T, IEnumerable<TChild>?> Items { get; }
        internal Func<TChild, object?> Key { get; }
        internal Func<TChild, object?>[] Orders { get; }
        internal Func<TChild, object?>[] Values { get; }
    }
}
