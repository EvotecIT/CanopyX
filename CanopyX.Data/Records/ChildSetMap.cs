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
/// Rows of the grid's own record type can also be kept to the records the caller's query reads (<c>WithinGrid</c>). Rows
/// without a key are left out, and text values are bounded.
/// </summary>
internal sealed class ChildSetMap<T, TChild> : RecordChildMap<T> {
    private readonly Expression<Func<T, IEnumerable<TChild>>> _items;
    private readonly ChildSpec<TChild> _spec;
    private readonly bool _withinGrid;
    private readonly Lazy<Compiled> _compiled;

    internal ChildSetMap(string id, Expression<Func<T, IEnumerable<TChild>>> items, ChildSpec<TChild> spec, bool withinGrid) : base(id) {
        if (withinGrid && typeof(TChild) != typeof(T)) throw new ArgumentException("Only rows of the grid's own record type can be kept within the grid.", nameof(withinGrid));
        _items = items;
        _spec = spec;
        _withinGrid = withinGrid;
        _compiled = new Lazy<Compiled>(Compile, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    internal override bool Collection => _spec.Collection;

    internal override int Size => _spec.Size;

    internal override async Task<CanopyCell?> QueryAsync(IQueryable<T> scoped, RecordReadContext<T> context, int offset, int take, int pageSize, bool page,
        CancellationToken cancellationToken) {
        var memory = context.Memory;
        var child = Expression.Parameter(typeof(TChild), "child");
        var key = ExpressionTools.Bind(_spec.Key, child, memory);
        var children = scoped.SelectMany(Items(memory));
        // Rows without a key cannot be told apart; rows of the grid's type outside the caller's query are not shown.
        Expression? keep = KeyPresent(key);
        if (_withinGrid) keep = ExpressionTools.And(keep, context.Exists(ExpressionTools.Bind(context.GridKey, child, memory)));
        if (keep != null) children = children.Where(Expression.Lambda<Func<TChild, bool>>(keep, child));
        int? total = null;
        if (_spec.Collection) total = await context.Executor.CountAsync(children, cancellationToken).ConfigureAwait(false);
        var rows = new List<object?[]>();
        if (take > 0 && (total == null || offset < total)) {
            var keys = _spec.Orders.Select(order => (ExpressionTools.Bind(order.Expression, child, memory), order.Descending)).ToList();
            var ordered = ChildOrdering.Apply(children, child, keys, key, memory);
            if (offset > 0) ordered = ordered.Skip(offset);
            var parts = new List<Expression> { Expression.Convert(key, typeof(object)) };
            foreach (var value in _spec.Values) parts.Add(Expression.Convert(RecordText.Truncate(ExpressionTools.Bind(value, child, memory), context.MaxText), typeof(object)));
            var projection = Expression.Lambda<Func<TChild, object?[]>>(Expression.NewArrayInit(typeof(object), parts), child);
            rows = await context.Executor.ToListAsync(ordered.Take(take).Select(projection), cancellationToken).ConfigureAwait(false);
        }
        // Rows written between the count and the window change the window; the reader reloads instead of mixing snapshots.
        if (total != null && rows.Count != Math.Min(take, Math.Max(0, total.Value - offset)))
            throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The record changed while it was read; reload it.");
        return Result(rows, total, pageSize, page, context.MaxText);
    }

    internal override CanopyCell? Evaluate(T record, RecordReadContext<T> context, int offset, int take, int pageSize, bool page) {
        var compiled = _compiled.Value;
        IEnumerable<TChild> source = compiled.Items(record) ?? Enumerable.Empty<TChild>();
        source = source.Where(child => RecordKeys.Format(compiled.Key(child)) != null);
        if (_withinGrid) {
            var gridKey = compiled.GridKey(context.GridKey);
            source = source.Where(child => RecordKeys.Format(gridKey(child)) is string id && context.Visible.Contains(id));
        }
        var children = source.ToList();
        int? total = _spec.Collection ? children.Count : (int?)null;
        var descending = _spec.Orders.Select(order => order.Descending).ToList();
        var keyed = children.Select(child => (Child: child, Keys: compiled.Orders.Select(order => order(child)).Concat(new[] { compiled.Key(child) }).ToArray())).ToList();
        // A stable sort over a total order: the child key is unique, so equal order keys are decided by it.
        var window = keyed.OrderBy(item => item.Keys, Comparer<object?[]>.Create((left, right) => ChildOrdering.Compare(left, right, descending)))
            .Skip(offset).Take(take);
        var rows = window.Select(item => new[] { compiled.Key(item.Child) }.Concat(compiled.Values.Select(value => value(item.Child))).ToArray()).ToList();
        return Result(rows, total, pageSize, page, context.MaxText);
    }

    private CanopyCell? Result(List<object?[]> rows, int? total, int pageSize, bool page, int maxText) {
        if (!page && rows.Count == 0) return null;
        foreach (var row in rows) for (var i = 1; i < row.Length; i++) row[i] = RecordText.Clip(row[i], maxText);
        return _spec.Build(rows, total, pageSize);
    }

    /// <summary>A test that the child key is present (not null, and for text not empty), or null for a key that always is.</summary>
    private static Expression? KeyPresent(Expression key) {
        if (key.Type == typeof(string)) return Expression.AndAlso(ExpressionTools.NotNull(key), Expression.NotEqual(key, Expression.Constant(string.Empty)));
        return ExpressionTools.IsNullable(key.Type) ? ExpressionTools.NotNull(key) : null;
    }

    /// <summary>The navigation; in memory a missing collection or reference on the way is an empty collection, as a database join is.</summary>
    private Expression<Func<T, IEnumerable<TChild>>> Items(bool memory) {
        if (!memory) return _items;
        var record = Expression.Parameter(typeof(T), "record");
        var body = ExpressionTools.Bind(_items, record, true);
        if (body.Type != typeof(IEnumerable<TChild>)) body = Expression.Convert(body, typeof(IEnumerable<TChild>));
        return Expression.Lambda<Func<T, IEnumerable<TChild>>>(Expression.Coalesce(body, Expression.Constant(Array.Empty<TChild>(), typeof(IEnumerable<TChild>))), record);
    }

    private static Func<TChild, object?> Getter(LambdaExpression lambda) {
        var child = Expression.Parameter(typeof(TChild), "child");
        return Expression.Lambda<Func<TChild, object?>>(Expression.Convert(ExpressionTools.Bind(lambda, child, true), typeof(object)), child).Compile();
    }

    private Compiled Compile() {
        var record = Expression.Parameter(typeof(T), "record");
        var items = Expression.Lambda<Func<T, IEnumerable<TChild>?>>(Expression.Convert(ExpressionTools.Bind(_items, record, true), typeof(IEnumerable<TChild>)), record).Compile();
        return new Compiled(items, Getter(_spec.Key), _spec.Orders.Select(order => Getter(order.Expression)).ToArray(), _spec.Values.Select(Getter).ToArray());
    }

    private sealed class Compiled {
        private Func<TChild, object?>? _gridKey;
        internal Compiled(Func<T, IEnumerable<TChild>?> items, Func<TChild, object?> key, Func<TChild, object?>[] orders, Func<TChild, object?>[] values) {
            Items = items; Key = key; Orders = orders; Values = values;
        }
        internal Func<T, IEnumerable<TChild>?> Items { get; }
        internal Func<TChild, object?> Key { get; }
        internal Func<TChild, object?>[] Orders { get; }
        internal Func<TChild, object?>[] Values { get; }
        /// <summary>The grid's key read from a child row of the grid's own type, compiled once.</summary>
        internal Func<TChild, object?> GridKey(LambdaExpression gridKey) => _gridKey ??= Getter(gridKey);
    }
}
