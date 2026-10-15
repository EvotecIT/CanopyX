using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Executes remote grid requests over any <see cref="IQueryable{T}"/>: EF Core, LINQ to objects or another LINQ provider.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// Requests become expression trees over the mapped column expressions only. Operands are passed as captured values, which
/// LINQ providers send as query parameters; no request text is ever composed into SQL. Rows are projected to the key and
/// the mapped columns, so a database selects only those values and navigations such as <c>x =&gt; x.Owner.Name</c> become joins.
/// </para>
/// <para>
/// Each request counts the dataset (<c>total</c>) and the matches (<c>matched</c>) and reads one window. Text matching follows
/// <see cref="CanopyQueryOptions.TextComparison"/>; text sorting follows the store's ordering (database collation). For a
/// grouped request (a fixed grouping or <c>groupBy</c> levels), pages and exports are read innermost group by innermost
/// group in the levels' order, so their order always agrees with the summary's group ranges. Summaries run one grouped
/// scan per level (several columns become one multi-column <c>GROUP BY</c>; <c>distinctCount</c> becomes <c>COUNT(DISTINCT …)</c>).
/// </para>
/// </remarks>
public sealed class CanopyQueryableProvider<T> : ICanopyDataProvider {
    private readonly Func<IQueryable<T>> _source;
    private readonly CanopyQueryOptions _options;

    /// <summary>Creates a provider over a query factory, called once per request (for example per database context).</summary>
    /// <param name="source">Returns the base query, already restricted to what the caller may see.</param>
    /// <param name="map">The column allow-list.</param>
    /// <param name="options">Text comparison, execution and revision options.</param>
    public CanopyQueryableProvider(Func<IQueryable<T>> source, CanopyColumnMap<T> map, CanopyQueryOptions? options = null) {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        Map = map ?? throw new ArgumentNullException(nameof(map));
        _options = options ?? new CanopyQueryOptions();
        _ = map.Schema;
    }

    /// <summary>Creates a provider over one query.</summary>
    /// <param name="source">The base query, already restricted to what the caller may see.</param>
    /// <param name="map">The column allow-list.</param>
    /// <param name="options">Text comparison, execution and revision options.</param>
    public CanopyQueryableProvider(IQueryable<T> source, CanopyColumnMap<T> map, CanopyQueryOptions? options = null)
        : this(Factory(source), map, options) { }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyColumnMap<T> Map { get; }

    /// <summary>Gets the schema of the mapped columns.</summary>
    public CanopyDataSchema Schema => Map.Schema;

    private CanopyQueryExecutor Executor => _options.Executor ?? CanopyQueryExecutor.Default;

    /// <inheritdoc />
    public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) =>
        _options.Revision?.Invoke(cancellationToken) ?? new ValueTask<string>("live");

    /// <inheritdoc />
    public async ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        var source = _source();
        var translator = Translator(source);
        var total = await Executor.CountAsync(source, cancellationToken).ConfigureAwait(false);
        var filtered = translator.Apply(source, request);
        var matched = ReferenceEquals(filtered, source) ? total : await Executor.CountAsync(filtered, cancellationToken).ConfigureAwait(false);
        var take = Math.Max(0, Math.Min(request.Limit, matched - request.Offset));
        if (take == 0) return new CanopyPageResult(total, matched, Array.Empty<CanopyGridRow>());
        var columns = Map.Columns.Select(column => column.Id).ToList();
        List<CanopyGridRow> rows;
        if (request.Levels.Count > 0) {
            rows = new List<CanopyGridRow>(take);
            await foreach (var row in GroupedRowsAsync(translator, filtered, request, request.Offset, take, columns, cancellationToken).ConfigureAwait(false)) rows.Add(row);
        } else {
            rows = await RowsAsync(translator, translator.Order(filtered, request.Sort).Skip(request.Offset).Take(take), columns, cancellationToken).ConfigureAwait(false);
        }
        return new CanopyPageResult(total, matched, rows);
    }

    /// <inheritdoc />
    public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        var source = _source();
        return new ValueTask<int>(Executor.CountAsync(Translator(source).Apply(source, request), cancellationToken));
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, [EnumeratorCancellation] CancellationToken cancellationToken) {
        Own(request);
        var source = _source();
        var translator = Translator(source);
        var columns = Map.Columns.Select(column => column.Id).ToList();
        var filtered = translator.Apply(source, request);
        // A grouped export follows the grid's record order, so outline ranges written from the summary fit its rows.
        if (request.Levels.Count > 0) {
            await foreach (var row in GroupedRowsAsync(translator, filtered, request, request.Offset, request.Limit, columns, cancellationToken).ConfigureAwait(false)) yield return row;
            yield break;
        }
        var query = translator.Order(filtered, request.Sort).Skip(request.Offset).Take(request.Limit).Select(translator.Projection(columns));
        await foreach (var values in Executor.StreamAsync(query, cancellationToken).ConfigureAwait(false)) yield return translator.ToRow(values, columns);
    }

    /// <inheritdoc />
    public async ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var source = _source();
        var translator = Translator(source);
        var filtered = translator.Apply(source, request.Query);
        var matched = await Executor.CountAsync(filtered, cancellationToken).ConfigureAwait(false);
        var searched = translator.ValueSearch(filtered, request.Column.Id, request.Search);
        var shape = Map.Get(request.Column.Id).Shape;
        var small = shape == ValueShape.Boolean || shape == ValueShape.Enum;
        var distinct = small ? -1 : await translator.DistinctAsync(searched, request.Column.Id, Executor, cancellationToken).ConfigureAwait(false);
        var buckets = await translator.BucketsAsync(searched, request.Column.Id, small ? (int?)null : request.Limit, Executor, cancellationToken).ConfigureAwait(false);
        // Merge buckets the store kept apart but the protocol's folding joins, then order them as the browser does.
        var merged = new Dictionary<string, (object? Value, int Count)>(StringComparer.Ordinal);
        foreach (var bucket in buckets) {
            var value = CanopyDataValues.Normalize(bucket.Value);
            var key = FacetKey(value);
            merged[key] = merged.TryGetValue(key, out var existing)
                ? (string.CompareOrdinal(existing.Value as string, value as string) <= 0 ? existing.Value : value, existing.Count + bucket.Count)
                : (value, bucket.Count);
        }
        var ordered = merged.Values.OrderBy(item => item.Value, FacetOrder.Instance).ToList();
        var complete = small || distinct <= request.Limit;
        var totalValues = complete ? ordered.Count : distinct;
        return new CanopyFacetResult(matched, totalValues, ordered.Take(request.Limit).Select(item => new CanopyFacetBucket(item.Value, item.Count)));
    }

    /// <inheritdoc />
    public async ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var source = _source();
        var translator = Translator(source);
        var filtered = translator.Apply(source, request.Query);
        var levels = request.Levels;
        if (levels.Count == 0) {
            var totals = await translator.GroupsAsync(filtered, Array.Empty<string>(), request.Aggregates, 1, Executor, cancellationToken).ConfigureAwait(false);
            return new CanopySummaryResult(totals.Count == 0 ? 0 : totals[0].Count, Values(request.Aggregates, totals.Count == 0 ? null : totals[0]), Array.Empty<CanopySummaryGroup>());
        }
        // One grouped scan per level, over each prefix of the grouping columns; the deepest level is read first.
        var columns = levels.Select(level => level.Column.Id).ToList();
        var byLevel = new List<QueryTranslator<T>.StoreGroup>[levels.Count];
        for (var depth = levels.Count - 1; depth >= 0; depth--) {
            byLevel[depth] = await translator.GroupsAsync(filtered, columns.Take(depth + 1).ToList(), request.Aggregates, 10001, Executor, cancellationToken).ConfigureAwait(false);
            if (byLevel[depth].Count > 10000) throw CanopyRequestException.Limit("The result has more groups than the protocol allows.");
        }
        var groups = Nest(request.Aggregates, byLevel);
        var stored = byLevel[0];
        var matched = stored.Sum(group => group.Count);
        // The complete-query values combine from the first level's groups, except distinct counts, which need their own scan.
        if (request.Aggregates.Any(aggregate => aggregate.Operation == CanopyGridAggregateOperation.DistinctCount)) {
            var totals = await translator.GroupsAsync(filtered, Array.Empty<string>(), request.Aggregates, 1, Executor, cancellationToken).ConfigureAwait(false);
            return new CanopySummaryResult(matched, Values(request.Aggregates, totals.Count == 0 ? null : totals[0]), groups);
        }
        var aggregates = new Dictionary<string, double?>(StringComparer.Ordinal);
        for (var i = 0; i < request.Aggregates.Count; i++) {
            var present = stored.Where(group => group.Counts[i] > 0).ToList();
            var count = present.Sum(group => group.Counts[i]);
            aggregates[request.Aggregates[i].Id] = request.Aggregates[i].Operation switch {
                CanopyGridAggregateOperation.Count => count,
                _ when count == 0 => null,
                CanopyGridAggregateOperation.Sum => present.Sum(group => group.Values[i]!.Value),
                CanopyGridAggregateOperation.Average => present.Sum(group => group.Values[i]!.Value * group.Counts[i]) / count,
                CanopyGridAggregateOperation.Minimum => present.Min(group => group.Values[i]!.Value),
                _ => present.Max(group => group.Values[i]!.Value)
            };
        }
        return new CanopySummaryResult(matched, aggregates, groups);
    }

    /// <summary>Nests the per-level store groups: each group of a deeper level goes inside the group of the level above with the same prefix values.</summary>
    private static List<CanopySummaryGroup> Nest(IReadOnlyList<CanopySummaryAggregate> aggregates, List<QueryTranslator<T>.StoreGroup>[] byLevel) {
        List<CanopySummaryGroup>? inner = null;
        Dictionary<string, List<CanopySummaryGroup>>? children = null;
        for (var depth = byLevel.Length - 1; depth >= 0; depth--) {
            var parents = new Dictionary<string, List<CanopySummaryGroup>>(StringComparer.Ordinal);
            var all = new List<CanopySummaryGroup>(byLevel[depth].Count);
            foreach (var group in byLevel[depth]) {
                var own = PathKey(group.KeyValues, depth + 1);
                List<CanopySummaryGroup>? nested = null;
                if (children != null && !children.TryGetValue(own, out nested)) nested = new List<CanopySummaryGroup>();
                var item = new CanopySummaryGroup(group.KeyValues[depth], group.Count, Values(aggregates, group), nested);
                all.Add(item);
                var parent = PathKey(group.KeyValues, depth);
                if (!parents.TryGetValue(parent, out var siblings)) parents[parent] = siblings = new List<CanopySummaryGroup>();
                siblings.Add(item);
            }
            children = parents;
            inner = all;
        }
        return inner!;
    }

    /// <summary>The identity of a group path: the group keys of its first values.</summary>
    private static string PathKey(object?[] values, int count) {
        var builder = new System.Text.StringBuilder();
        for (var i = 0; i < count; i++) builder.Append(CanopyRemoteHandler.GroupKey(values[i]).Replace("\\", "\\\\").Replace("/", "\\/")).Append('/');
        return builder.ToString();
    }

    private static Dictionary<string, double?> Values(IReadOnlyList<CanopySummaryAggregate> aggregates, QueryTranslator<T>.StoreGroup? group) {
        var values = new Dictionary<string, double?>(StringComparer.Ordinal);
        for (var i = 0; i < aggregates.Count; i++)
            values[aggregates[i].Id] = group == null ? aggregates[i].Counting ? 0 : (double?)null : group.Values[i];
        return values;
    }

    private const int RunSize = 64;

    /// <summary>A group of the ordered group tree a grouped window is read from.</summary>
    private sealed class GroupNode {
        internal GroupNode(object? value) { Value = value; }
        internal object? Value { get; }
        internal double? Aggregate { get; set; }
        internal int Count { get; set; }
        internal QueryTranslator<T>.StoreGroup? Leaf { get; set; }
        internal Dictionary<string, GroupNode> Children { get; } = new Dictionary<string, GroupNode>(StringComparer.Ordinal);
    }

    /// <summary>
    /// The innermost groups of a grouped request in record order: level by level, each level's groups in its order (by value,
    /// or by the level's aggregate over the group). One grouped scan reads the innermost groups and their counts, with the
    /// count, minimum and maximum aggregates of the levels, which combine exactly up the levels; a level ordered by a sum,
    /// average or distinct count adds one scan over its prefix of the grouping columns, so its groups order exactly as the
    /// summary computes them.
    /// </summary>
    private async Task<List<(QueryTranslator<T>.StoreGroup Group, int Start)>> OrderedLeavesAsync(QueryTranslator<T> translator, IQueryable<T> filtered,
        IReadOnlyList<CanopySummaryLevel> levels, CancellationToken cancellationToken) {
        var columns = levels.Select(level => level.Column.Id).ToList();
        var exact = levels.Where(level => level.Aggregate != null).Select(level => level.Aggregate!).Where(aggregate => (aggregate.Operation == CanopyGridAggregateOperation.Count ||
            aggregate.Operation == CanopyGridAggregateOperation.Minimum || aggregate.Operation == CanopyGridAggregateOperation.Maximum)).Distinct().ToList();
        var leaves = await translator.GroupsAsync(filtered, columns, exact, 10001, Executor, cancellationToken).ConfigureAwait(false);
        if (leaves.Count > 10000) throw CanopyRequestException.Limit("The result has more groups than the protocol allows.");
        var aggregates = new Dictionary<string, double?>[levels.Count];
        var combined = new int[levels.Count];
        for (var depth = 0; depth < levels.Count; depth++) {
            var aggregate = levels[depth].Aggregate;
            combined[depth] = aggregate == null ? -1 : exact.IndexOf(aggregate);
            if (aggregate == null || combined[depth] >= 0) continue;
            var groups = await translator.GroupsAsync(filtered, columns.Take(depth + 1).ToList(), new[] { aggregate }, 10001, Executor, cancellationToken).ConfigureAwait(false);
            if (groups.Count > 10000) throw CanopyRequestException.Limit("The result has more groups than the protocol allows.");
            aggregates[depth] = groups.ToDictionary(group => PathKey(group.KeyValues, depth + 1), group => group.Values[0], StringComparer.Ordinal);
        }
        var root = new GroupNode(null);
        foreach (var leaf in leaves) {
            var node = root;
            for (var depth = 0; depth < levels.Count; depth++) {
                var key = CanopyRemoteHandler.GroupKey(leaf.KeyValues[depth]);
                if (!node.Children.TryGetValue(key, out var child)) {
                    node.Children[key] = child = new GroupNode(leaf.KeyValues[depth]);
                    if (aggregates[depth] != null) child.Aggregate = aggregates[depth].TryGetValue(PathKey(leaf.KeyValues, depth + 1), out var value) ? value : null;
                    else if (combined[depth] >= 0 && levels[depth].Aggregate!.Operation == CanopyGridAggregateOperation.Count) child.Aggregate = 0;
                }
                if (combined[depth] >= 0) child.Aggregate = Combine(levels[depth].Aggregate!.Operation, child.Aggregate, leaf.Values[combined[depth]]);
                child.Count += leaf.Count;
                node = child;
            }
            // Values the store keeps apart but the protocol treats as one (instants below a millisecond) cannot be served as groups.
            if (node.Leaf != null) throw new InvalidOperationException("The store returned groups that the protocol cannot tell apart; store grouping values at protocol precision.");
            node.Leaf = leaf;
        }
        var ordered = new List<(QueryTranslator<T>.StoreGroup Group, int Start)>(leaves.Count);
        var start = 0;
        void Walk(GroupNode node, int depth) {
            if (depth == levels.Count) {
                ordered.Add((node.Leaf!, start));
                start += node.Leaf!.Count;
                return;
            }
            var children = node.Children.Values.ToList();
            children.Sort(GroupOrdering.Create<GroupNode>(Schema, levels[depth], child => child.Value, child => child.Aggregate));
            foreach (var child in children) Walk(child, depth + 1);
        }
        Walk(root, 0);
        return ordered;
    }

    /// <summary>Combines a group's count, minimum or maximum with one inner group's: these combine exactly.</summary>
    private static double? Combine(CanopyGridAggregateOperation operation, double? total, double? part) {
        if (operation == CanopyGridAggregateOperation.Count) return (total ?? 0) + (part ?? 0);
        if (!part.HasValue) return total;
        if (!total.HasValue) return part;
        return operation == CanopyGridAggregateOperation.Minimum ? Math.Min(total.Value, part.Value) : Math.Max(total.Value, part.Value);
    }

    /// <summary>
    /// Streams a window of a grouped request in record order. The window covers a contiguous run of innermost groups: up to
    /// eight are read one by one with <c>WHERE</c> on their values (an index on the grouping and sort columns serves each),
    /// more in queries ranked by group order, at most 64 groups each so the parameters stay within every database's limit.
    /// Each read is ordered by the remaining sort keys and the record key.
    /// </summary>
    private async IAsyncEnumerable<CanopyGridRow> GroupedRowsAsync(QueryTranslator<T> translator, IQueryable<T> filtered, CanopyDataRequest request, int offset, int take,
        List<string> columns, [EnumeratorCancellation] CancellationToken cancellationToken) {
        var leaves = await OrderedLeavesAsync(translator, filtered, request.Levels, cancellationToken).ConfigureAwait(false);
        var end = (long)offset + take;
        var overlapping = leaves.Where(item => item.Start + item.Group.Count > offset && item.Start < end).ToList();
        var rest = request.InnerSort;
        var values = request.Levels.Select(level => translator.Value(level.Column.Id)).ToArray();
        Expression Match(QueryTranslator<T>.StoreGroup group) {
            Expression? test = null;
            for (var i = 0; i < values.Length; i++)
                test = ExpressionTools.And(test, group.Keys[i] == null ? ExpressionTools.IsNull(values[i]) : Expression.Equal(values[i], ExpressionTools.Parameter(group.Keys[i], values[i].Type)));
            return test!;
        }
        var size = overlapping.Count <= 8 ? 1 : RunSize;
        for (var first = 0; first < overlapping.Count; first += size) {
            var run = overlapping.Skip(first).Take(size).ToList();
            var runStart = run[0].Start;
            var runEnd = run[run.Count - 1].Start + run[run.Count - 1].Group.Count;
            var skip = Math.Max(0, offset - runStart);
            var count = (int)Math.Min(runEnd, end) - (runStart + skip);
            IQueryable<T> window;
            if (run.Count == 1) {
                window = translator.Order(filtered.Where(Expression.Lambda<Func<T, bool>>(Match(run[0].Group), translator.Row)), rest);
            } else {
                var tests = run.Select(item => Match(item.Group)).ToList();
                Expression? any = null;
                foreach (var test in tests) any = ExpressionTools.Or(any, test);
                window = translator.Order(filtered.Where(Expression.Lambda<Func<T, bool>>(any!, translator.Row)), rest, QueryTranslator<T>.Rank(values[0], tests));
            }
            await foreach (var row in Executor.StreamAsync(window.Skip(skip).Take(count).Select(translator.Projection(columns)), cancellationToken).ConfigureAwait(false))
                yield return translator.ToRow(row, columns);
        }
    }

    private async Task<List<CanopyGridRow>> RowsAsync(QueryTranslator<T> translator, IQueryable<T> window, List<string> columns, CancellationToken cancellationToken) {
        var values = await Executor.ToListAsync(window.Select(translator.Projection(columns)), cancellationToken).ConfigureAwait(false);
        return values.Select(row => translator.ToRow(row, columns)).ToList();
    }

    private QueryTranslator<T> Translator(IQueryable<T> source) {
        var memory = source.Provider is EnumerableQuery;
        var comparison = _options.TextComparison == CanopyTextComparison.Auto
            ? memory ? CanopyTextComparison.Canonical : CanopyTextComparison.Lowercase
            : _options.TextComparison;
        return Map.Translator(comparison, memory);
    }

    private void Own(CanopyDataRequest request) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        if (!ReferenceEquals(request.Schema, Map.Schema)) throw new ArgumentException("The request belongs to another schema.", nameof(request));
    }

    internal static string FacetKey(object? value) => value switch {
        null => "null",
        string text => "s:" + CanopyTextFolding.Fold(text),
        bool flag => flag ? "b:true" : "b:false",
        DateTime date => "d:" + (date.Ticks / TimeSpan.TicksPerMillisecond),
        var number => "n:" + CanopyDataValues.FormatNumber(CanopyDataValues.ToDouble(number!))
    };

    private static Func<IQueryable<T>> Factory(IQueryable<T> source) {
        if (source == null) throw new ArgumentNullException(nameof(source));
        return () => source;
    }
}
