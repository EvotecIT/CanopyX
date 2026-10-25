using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    private static readonly MethodInfo CountAll = Method(nameof(Enumerable.Count), 1);
    private static readonly MethodInfo CountWhere = Method(nameof(Enumerable.Count), 2);

    private static readonly MethodInfo WhereMethod = typeof(Enumerable).GetMethods().Single(method => method.Name == nameof(Enumerable.Where) &&
        method.GetParameters().Length == 2 && method.GetParameters()[1].ParameterType.GetGenericTypeDefinition() == typeof(Func<,>));
    private static readonly MethodInfo SelectMethod = typeof(Enumerable).GetMethods().Single(method => method.Name == nameof(Enumerable.Select) &&
        method.GetParameters().Length == 2 && method.GetParameters()[1].ParameterType.GetGenericTypeDefinition() == typeof(Func<,>));
    private static readonly MethodInfo DistinctMethod = Method(nameof(Enumerable.Distinct), 1);

    /// <summary>A group as read from the store: the typed key of each grouping column, their normalized values, the count and aggregate slots.</summary>
    internal sealed class StoreGroup {
        internal StoreGroup(object?[] keys, int count, double?[] values, int[] counts) {
            Keys = keys; KeyValues = keys.Select(CanopyDataValues.Normalize).ToArray(); Count = count; Values = values; Counts = counts;
        }
        /// <summary>The typed store key of each grouping column, outermost first.</summary>
        internal object?[] Keys { get; }
        /// <summary>The normalized raw value of each grouping column.</summary>
        internal object?[] KeyValues { get; }
        /// <summary>The typed key of the first grouping column.</summary>
        internal object? Key => Keys.Length == 0 ? null : Keys[0];
        /// <summary>The normalized value of the first grouping column.</summary>
        internal object? Value => KeyValues.Length == 0 ? null : KeyValues[0];
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

    /// <summary>Groups by the exact values of up to four columns (or a constant for complete-query totals) and evaluates the aggregates in the store.</summary>
    internal Task<List<StoreGroup>> GroupsAsync(IQueryable<T> source, IReadOnlyList<string> columns, IReadOnlyList<CanopySummaryAggregate> aggregates, int take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken, IReadOnlyList<CanopySummaryLevel>? levels = null, bool pivot = false) {
        if (aggregates.Count > 32) throw new ArgumentException("At most 32 aggregates are supported.", nameof(aggregates));
        if (columns.Count > (pivot ? 38 : 4)) throw new ArgumentException("The grouping exceeds its column bound.", nameof(columns));
        foreach (var aggregate in aggregates) {
            if (aggregate.Operation == CanopyGridAggregateOperation.Custom)
                throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not compute the custom aggregate '" + aggregate.CustomOperation + "'.");
        }
        var parts = columns.Select((column, index) => levels == null ? GroupValue(column) : GroupValue(levels[index])).ToArray();
        // One column groups by its value; several by a composite key, which LINQ providers translate like an anonymous type.
        var key = parts.Length == 0 ? Expression.Constant(1) : parts.Length == 1 ? parts[0] : CompositeKeys.New(parts);
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(GroupsCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type);
        return (Task<List<StoreGroup>>)method.Invoke(this, new object[] { source, key, parts.Length, aggregates, take, executor, cancellationToken })!;
    }

    private async Task<List<StoreGroup>> GroupsCoreAsync<TKey>(IQueryable<T> source, Expression key, int width, IReadOnlyList<CanopySummaryAggregate> aggregates, int take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var group = Expression.Parameter(typeof(IGrouping<TKey, T>), "group");
        var rowType = typeof(AggregateRow<TKey>);
        Expression groupKey = Expression.Property(group, nameof(IGrouping<TKey, T>.Key));
        // A composite key is rebuilt from its members, which every provider projects as plain grouped columns.
        if (width > 1) groupKey = CompositeKeys.New(CompositeKeys.Leaves(groupKey));
        var bindings = new List<MemberBinding> {
            Expression.Bind(rowType.GetProperty(nameof(AggregateRow<TKey>.Key))!, groupKey),
            Expression.Bind(rowType.GetProperty(nameof(AggregateRow<TKey>.Rows))!, Expression.Call(CountAll.MakeGenericMethod(typeof(T)), group))
        };
        for (var i = 0; i < aggregates.Count; i++) {
            var value = GroupValue(aggregates[i].Column.Id);
            var nullable = ExpressionTools.IsNullable(value.Type);
            var present = nullable
                ? Expression.Call(CountWhere.MakeGenericMethod(typeof(T)), group, Expression.Lambda(ExpressionTools.NotNull(value), Row))
                : (Expression)Expression.Call(CountAll.MakeGenericMethod(typeof(T)), group);
            bindings.Add(Expression.Bind(rowType.GetProperty("N" + i)!, present));
            var operation = aggregates[i].Operation;
            if (operation == CanopyGridAggregateOperation.Count) continue;
            if (operation == CanopyGridAggregateOperation.DistinctCount) {
                // COUNT(DISTINCT value) over the nonmissing values: group.Where(value != null).Select(value).Distinct().Count().
                Expression members = group;
                if (nullable) members = Expression.Call(WhereMethod.MakeGenericMethod(typeof(T)), members, Expression.Lambda(ExpressionTools.NotNull(value), Row));
                var selected = Expression.Call(SelectMethod.MakeGenericMethod(typeof(T), value.Type), members, Expression.Lambda(value, Row));
                var distinct = Expression.Call(CountAll.MakeGenericMethod(value.Type), Expression.Call(DistinctMethod.MakeGenericMethod(value.Type), selected));
                bindings.Add(Expression.Bind(rowType.GetProperty("V" + i)!, Expression.Convert(distinct, typeof(double?))));
                continue;
            }
            var name = operation == CanopyGridAggregateOperation.Sum ? nameof(Enumerable.Sum) : operation == CanopyGridAggregateOperation.Average ? nameof(Enumerable.Average)
                : operation == CanopyGridAggregateOperation.Minimum ? nameof(Enumerable.Min) : nameof(Enumerable.Max);
            var selector = Expression.Lambda(typeof(Func<T, double?>), Expression.Convert(Binary64(value), typeof(double?)), Row);
            var aggregate = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == name && candidate.IsGenericMethodDefinition &&
                candidate.GetGenericArguments().Length == 1 && candidate.GetParameters().Length == 2 &&
                candidate.GetParameters()[1].ParameterType == typeof(Func<,>).MakeGenericType(candidate.GetGenericArguments()[0], typeof(double?)));
            bindings.Add(Expression.Bind(rowType.GetProperty("V" + i)!, Expression.Call(aggregate.MakeGenericMethod(typeof(T)), group, selector)));
        }
        var projection = Expression.Lambda<Func<IGrouping<TKey, T>, AggregateRow<TKey>>>(Expression.MemberInit(Expression.New(rowType), bindings), group);
        var keyLambda = Expression.Lambda<Func<T, TKey>>(key, Row);
        var rows = source.GroupBy(keyLambda).Select(projection);
        // Ordering by the key makes the bounded read deterministic; the endpoint applies the protocol's group order afterwards.
        var item = Expression.Parameter(rowType, "row");
        Expression key0 = Expression.Property(item, nameof(AggregateRow<TKey>.Key));
        if (width <= 1) {
            rows = rows.OrderBy(Expression.Lambda<Func<AggregateRow<TKey>, TKey>>(key0, item));
        } else {
            var members = CompositeKeys.Leaves(key0);
            var ordered = (IOrderedQueryable<AggregateRow<TKey>>)Order(rows, Expression.Lambda(members[0], item), nameof(Queryable.OrderBy));
            for (var i = 1; i < members.Length; i++) ordered = (IOrderedQueryable<AggregateRow<TKey>>)Order(ordered, Expression.Lambda(members[i], item), nameof(Queryable.ThenBy));
            rows = ordered;
        }
        var list = await executor.ToListAsync(rows.Take(take), cancellationToken).ConfigureAwait(false);
        var result = new List<StoreGroup>(list.Count);
        foreach (var row in list) {
            var values = new double?[aggregates.Count];
            var counts = new int[aggregates.Count];
            for (var i = 0; i < aggregates.Count; i++) {
                counts[i] = (int)rowType.GetProperty("N" + i)!.GetValue(row)!;
                var stored = (double?)rowType.GetProperty("V" + i)!.GetValue(row);
                values[i] = aggregates[i].Operation switch {
                    CanopyGridAggregateOperation.Count => counts[i],
                    CanopyGridAggregateOperation.DistinctCount => counts[i] == 0 ? 0 : stored ?? 0,
                    _ => counts[i] == 0 ? null : stored
                };
            }
            var keys = width == 0 ? Array.Empty<object?>() : width == 1 ? new object?[] { row.Key } : CompositeKeys.Values(row.Key!);
            result.Add(new StoreGroup(keys, row.Rows, values, counts));
        }
        return result;
    }

    /// <summary>Reads value-list buckets: grouped by the folded text or the value, ordered by key with missing values last.</summary>
    internal Task<List<StoreBucket>> BucketsAsync(IQueryable<T> source, string column, int? take, CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var value = FacetValue(column);
        var text = Map.Get(column).Shape == ValueShape.Text;
        var key = text ? ExpressionTools.Fold(value, Comparison) : value;
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(BucketsCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type, value.Type);
        return (Task<List<StoreBucket>>)method.Invoke(this, new object?[] { source, key, value, text, take, executor, cancellationToken })!;
    }

    /// <summary>Counts distinct value-list keys after value search.</summary>
    internal Task<int> DistinctAsync(IQueryable<T> source, string column, CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var value = FacetValue(column);
        var key = Map.Get(column).Shape == ValueShape.Text ? ExpressionTools.Fold(value, Comparison) : value;
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(DistinctCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(key.Type);
        return (Task<int>)method.Invoke(this, new object[] { source, key, executor, cancellationToken })!;
    }

    private Task<int> DistinctCoreAsync<TKey>(IQueryable<T> source, Expression key, CanopyQueryExecutor executor, CancellationToken cancellationToken) =>
        executor.CountAsync(source.Select(Expression.Lambda<Func<T, TKey>>(key, Row)).Distinct(), cancellationToken);

    private Expression FacetValue(string column) {
        var value = _values[column];
        return Map.Get(column).Shape == ValueShape.Decimal ? Binary64(value) : value;
    }

    /// <summary>Streams raw text groups without a store-folded search or prefix. The caller applies canonical folding,
    /// search and ordering without buffering the grouped records or relying on the store's Unicode support.</summary>
    internal async IAsyncEnumerable<StoreBucket> TextBucketsAsync(IQueryable<T> source, string column, CanopyQueryExecutor executor,
        [EnumeratorCancellation] CancellationToken cancellationToken) {
        var value = _values[column];
        var query = BucketsQuery<string, string>(source, value, value, false, null);
        await foreach (var row in executor.StreamAsync(query, cancellationToken).ConfigureAwait(false))
            yield return new StoreBucket(row.Key, row.Value, row.Count);
    }

    /// <summary>Streams numeric or date buckets in value order so canonical search and merging need retain only the requested prefix.</summary>
    internal IAsyncEnumerable<StoreBucket> OrderedValueBucketsAsync(IQueryable<T> source, string column, CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var value = FacetValue(column);
        var method = typeof(QueryTranslator<T>).GetMethod(nameof(OrderedValueBucketsCoreAsync), BindingFlags.NonPublic | BindingFlags.Instance)!.MakeGenericMethod(value.Type);
        return (IAsyncEnumerable<StoreBucket>)method.Invoke(this, new object[] { source, value, executor, cancellationToken })!;
    }

    private async IAsyncEnumerable<StoreBucket> OrderedValueBucketsCoreAsync<TValue>(IQueryable<T> source, Expression value, CanopyQueryExecutor executor,
        [EnumeratorCancellation] CancellationToken cancellationToken) {
        var query = BucketsQuery<TValue, TValue>(source, value, value, false, null);
        var item = Expression.Parameter(typeof(FacetRow<TValue, TValue>), "bucket");
        var key = Expression.Property(item, nameof(FacetRow<TValue, TValue>.Key));
        var ordered = ExpressionTools.IsNullable(typeof(TValue))
            ? query.OrderBy(Expression.Lambda<Func<FacetRow<TValue, TValue>, int>>(Expression.Condition(ExpressionTools.IsNull(key), Expression.Constant(1), Expression.Constant(0)), item))
                .ThenBy(Expression.Lambda<Func<FacetRow<TValue, TValue>, TValue>>(key, item))
            : query.OrderBy(Expression.Lambda<Func<FacetRow<TValue, TValue>, TValue>>(key, item));
        await foreach (var row in executor.StreamAsync(ordered, cancellationToken).ConfigureAwait(false))
            yield return new StoreBucket(row.Key, row.Value, row.Count);
    }

    private async Task<List<StoreBucket>> BucketsCoreAsync<TKey, TValue>(IQueryable<T> source, Expression key, Expression value, bool text, int? take,
        CanopyQueryExecutor executor, CancellationToken cancellationToken) {
        var list = await executor.ToListAsync(BucketsQuery<TKey, TValue>(source, key, value, text, take), cancellationToken).ConfigureAwait(false);
        return list.Select(row => new StoreBucket(row.Key, row.Value, row.Count)).ToList();
    }

    private IQueryable<FacetRow<TKey, TValue>> BucketsQuery<TKey, TValue>(IQueryable<T> source, Expression key, Expression value, bool text, int? take) {
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
        return rows;
    }

    private static IOrderedQueryable<TRow> ThenByKey<TRow, TKey>(IOrderedQueryable<TRow> rows, Expression<Func<TRow, TKey>> key, bool canonical) =>
        canonical && typeof(TKey) == typeof(string) ? rows.ThenBy(key, (IComparer<TKey>)StringComparer.Ordinal) : rows.ThenBy(key);

    private static IQueryable Order(IQueryable source, LambdaExpression key, string name) {
        var method = typeof(Queryable).GetMethods().Single(candidate => candidate.Name == name && candidate.GetParameters().Length == 2)
            .MakeGenericMethod(source.ElementType, key.ReturnType);
        return (IQueryable)method.Invoke(null, new object[] { source, key })!;
    }

    private static MethodInfo Method(string name, int parameters) => typeof(Enumerable).GetMethods()
        .Single(method => method.Name == name && method.GetParameters().Length == parameters);
}
