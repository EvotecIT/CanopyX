using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    private static readonly MethodInfo CountAll = Method(nameof(Enumerable.Count), 1);
    private static readonly MethodInfo CountWhere = Method(nameof(Enumerable.Count), 2);

    /// <summary>A group as read from the store: the typed key, its normalized value, its count and aggregate slots.</summary>
    internal sealed class StoreGroup {
        internal StoreGroup(object? key, int count, double?[] values, int[] counts) {
            Key = key; Value = CanopyDataValues.Normalize(key); Count = count; Values = values; Counts = counts;
        }
        internal object? Key { get; }
        internal object? Value { get; }
        internal int Count { get; }
        internal double?[] Values { get; }
        internal int[] Counts { get; }
    }

    /// <summary>A value-list bucket as read from the store.</summary>
    internal sealed class StoreBucket {
        internal StoreBucket(object? key, object? value, int count) { Key = key; Value = value; Count = count; }
        internal object? Key { get; }
        internal object? Value { get; }
        internal int Count { get; }
    }

    /// <summary>Groups by the exact value of a column (or a constant for complete-query totals) and evaluates the aggregates in the store.</summary>
    internal Task<List<StoreGroup>> GroupsAsync(IQueryable<T> source, string? column, IReadOnlyList<CanopySummaryAggregate> aggregates, int take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        if (aggregates.Count > 32) throw new ArgumentException("At most 32 aggregates are supported.", nameof(aggregates));
        var key = column == null ? (Expression)Expression.Constant(1) : _values[column];
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(GroupsCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type);
        return (Task<List<StoreGroup>>)method.Invoke(this, new object[] { source, key, aggregates, take, executor, cancellationToken })!;
    }

    private async Task<List<StoreGroup>> GroupsCoreAsync<TKey>(IQueryable<T> source, Expression key, IReadOnlyList<CanopySummaryAggregate> aggregates, int take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var group = Expression.Parameter(typeof(IGrouping<TKey, T>), "group");
        var rowType = typeof(AggregateRow<TKey>);
        var bindings = new List<MemberBinding> {
            Expression.Bind(rowType.GetProperty(nameof(AggregateRow<TKey>.Key))!, Expression.Property(group, nameof(IGrouping<TKey, T>.Key))),
            Expression.Bind(rowType.GetProperty(nameof(AggregateRow<TKey>.Rows))!, Expression.Call(CountAll.MakeGenericMethod(typeof(T)), group))
        };
        for (var i = 0; i < aggregates.Count; i++) {
            var value = _values[aggregates[i].Column.Id];
            var present = ExpressionTools.IsNullable(value.Type)
                ? Expression.Call(CountWhere.MakeGenericMethod(typeof(T)), group, Expression.Lambda(ExpressionTools.NotNull(value), Row))
                : (Expression)Expression.Call(CountAll.MakeGenericMethod(typeof(T)), group);
            bindings.Add(Expression.Bind(rowType.GetProperty("N" + i)!, present));
            var operation = aggregates[i].Operation;
            if (operation == CanopyGridAggregateOperation.Count) continue;
            var name = operation == CanopyGridAggregateOperation.Sum ? nameof(Enumerable.Sum) : operation == CanopyGridAggregateOperation.Average ? nameof(Enumerable.Average)
                : operation == CanopyGridAggregateOperation.Minimum ? nameof(Enumerable.Min) : nameof(Enumerable.Max);
            var selector = Expression.Lambda(typeof(Func<T, double?>), Expression.Convert(value, typeof(double?)), Row);
            var aggregate = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == name && candidate.IsGenericMethodDefinition &&
                candidate.GetGenericArguments().Length == 1 && candidate.GetParameters().Length == 2 &&
                candidate.GetParameters()[1].ParameterType == typeof(Func<,>).MakeGenericType(candidate.GetGenericArguments()[0], typeof(double?)));
            bindings.Add(Expression.Bind(rowType.GetProperty("V" + i)!, Expression.Call(aggregate.MakeGenericMethod(typeof(T)), group, selector)));
        }
        var projection = Expression.Lambda<Func<IGrouping<TKey, T>, AggregateRow<TKey>>>(Expression.MemberInit(Expression.New(rowType), bindings), group);
        var keyLambda = Expression.Lambda<Func<T, TKey>>(key, Row);
        // Ordering by the key makes the bounded read deterministic; the endpoint applies the protocol's group order afterwards.
        var item = Expression.Parameter(rowType, "row");
        var byKey = Expression.Lambda<Func<AggregateRow<TKey>, TKey>>(Expression.Property(item, nameof(AggregateRow<TKey>.Key)), item);
        var rows = await executor.ToListAsync(source.GroupBy(keyLambda).Select(projection).OrderBy(byKey).Take(take), cancellationToken).ConfigureAwait(false);
        var result = new List<StoreGroup>(rows.Count);
        foreach (var row in rows) {
            var values = new double?[aggregates.Count];
            var counts = new int[aggregates.Count];
            for (var i = 0; i < aggregates.Count; i++) {
                counts[i] = (int)rowType.GetProperty("N" + i)!.GetValue(row)!;
                values[i] = aggregates[i].Operation == CanopyGridAggregateOperation.Count ? counts[i] : counts[i] == 0 ? null : (double?)rowType.GetProperty("V" + i)!.GetValue(row);
            }
            result.Add(new StoreGroup(row.Key, row.Rows, values, counts));
        }
        return result;
    }

    /// <summary>Reads value-list buckets: grouped by the folded text or the value, ordered by key with missing values last.</summary>
    internal Task<List<StoreBucket>> BucketsAsync(IQueryable<T> source, string column, int? take, CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var value = _values[column];
        var text = Map.Get(column).Shape == ValueShape.Text;
        var key = text ? ExpressionTools.Fold(value, Comparison) : value;
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(BucketsCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type, value.Type);
        return (Task<List<StoreBucket>>)method.Invoke(this, new object?[] { source, key, value, text, take, executor, cancellationToken })!;
    }

    /// <summary>Counts distinct value-list keys after value search.</summary>
    internal Task<int> DistinctAsync(IQueryable<T> source, string column, CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var value = _values[column];
        var key = Map.Get(column).Shape == ValueShape.Text ? ExpressionTools.Fold(value, Comparison) : value;
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(DistinctCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type);
        return (Task<int>)method.Invoke(this, new object[] { source, key, executor, cancellationToken })!;
    }

    private Task<int> DistinctCoreAsync<TKey>(IQueryable<T> source, Expression key, CanopyQueryExecutor executor, CancellationToken cancellationToken) =>
        executor.CountAsync(source.Select(Expression.Lambda<Func<T, TKey>>(key, Row)).Distinct(), cancellationToken);

    private async Task<List<StoreBucket>> BucketsCoreAsync<TKey, TValue>(IQueryable<T> source, Expression key, Expression value, bool text, int? take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var group = Expression.Parameter(typeof(IGrouping<TKey, T>), "group");
        var rowType = typeof(FacetRow<TKey, TValue>);
        Expression representative = Expression.Convert(Expression.Property(group, nameof(IGrouping<TKey, T>.Key)), typeof(TValue));
        var canonical = Comparison == CanopyTextComparison.Canonical;
        if (text && canonical) {
            // In memory, the representative is the ordinal minimum, as the browser chooses it.
            var orderBy = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == nameof(Enumerable.OrderBy) && candidate.GetParameters().Length == 3);
            var firstMethod = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == nameof(Enumerable.First) && candidate.GetParameters().Length == 1);
            var sorted = Expression.Call(orderBy.MakeGenericMethod(typeof(T), typeof(TValue)), group, Expression.Lambda(value, Row), Expression.Constant(StringComparer.Ordinal, typeof(IComparer<TValue>)));
            representative = Expression.Call(firstMethod.MakeGenericMethod(typeof(T)), sorted);
            representative = Expression.Invoke(Expression.Lambda(value, Row), representative);
        } else if (text) {
            var min = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == nameof(Enumerable.Min) && candidate.IsGenericMethodDefinition &&
                candidate.GetGenericArguments().Length == 2 && candidate.GetParameters().Length == 2);
            representative = Expression.Call(min.MakeGenericMethod(typeof(T), typeof(TValue)), group, Expression.Lambda(value, Row));
        }
        var projection = Expression.Lambda<Func<IGrouping<TKey, T>, FacetRow<TKey, TValue>>>(Expression.MemberInit(Expression.New(rowType),
            Expression.Bind(rowType.GetProperty(nameof(FacetRow<TKey, TValue>.Key))!, Expression.Property(group, nameof(IGrouping<TKey, T>.Key))),
            Expression.Bind(rowType.GetProperty(nameof(FacetRow<TKey, TValue>.Value))!, representative),
            Expression.Bind(rowType.GetProperty(nameof(FacetRow<TKey, TValue>.Count))!, Expression.Call(CountAll.MakeGenericMethod(typeof(T)), group))), group);
        IQueryable<FacetRow<TKey, TValue>> rows = source.GroupBy(Expression.Lambda<Func<T, TKey>>(key, Row)).Select(projection);
        if (take != null) {
            var item = Expression.Parameter(rowType, "bucket");
            var keyAccess = Expression.Property(item, nameof(FacetRow<TKey, TValue>.Key));
            IOrderedQueryable<FacetRow<TKey, TValue>> ordered = ExpressionTools.IsNullable(typeof(TKey))
                ? ThenByKey(rows.OrderBy(Expression.Lambda<Func<FacetRow<TKey, TValue>, int>>(Expression.Condition(ExpressionTools.IsNull(keyAccess), Expression.Constant(1), Expression.Constant(0)), item)),
                    Expression.Lambda<Func<FacetRow<TKey, TValue>, TKey>>(keyAccess, item), canonical)
                : rows.OrderBy(Expression.Lambda<Func<FacetRow<TKey, TValue>, TKey>>(keyAccess, item));
            rows = ordered.Take(take.Value);
        }
        var list = await executor.ToListAsync(rows, cancellationToken).ConfigureAwait(false);
        return list.Select(row => new StoreBucket(row.Key, row.Value, row.Count)).ToList();
    }

    private static IOrderedQueryable<TRow> ThenByKey<TRow, TKey>(IOrderedQueryable<TRow> rows, Expression<Func<TRow, TKey>> key, bool canonical) =>
        canonical && typeof(TKey) == typeof(string) ? rows.ThenBy(key, (IComparer<TKey>)StringComparer.Ordinal) : rows.ThenBy(key);

    private static MethodInfo Method(string name, int parameters) => typeof(Enumerable).GetMethods()
        .Single(method => method.Name == name && method.GetParameters().Length == parameters);
}
