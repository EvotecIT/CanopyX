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
/// grouped view, pages are read group by group so their order always agrees with the summary's group ranges.
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
        var rows = Grouped(request)
            ? await GroupedRowsAsync(translator, filtered, request, take, columns, cancellationToken).ConfigureAwait(false)
            : await RowsAsync(translator, translator.Order(filtered, request.Sort).Skip(request.Offset).Take(take), columns, cancellationToken).ConfigureAwait(false);
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
        var query = translator.Order(translator.Apply(source, request), request.Sort).Skip(request.Offset).Take(request.Limit).Select(translator.Projection(columns));
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
        if (request.GroupColumn == null) {
            var totals = await translator.GroupsAsync(filtered, null, request.Aggregates, 1, Executor, cancellationToken).ConfigureAwait(false);
            return new CanopySummaryResult(totals.Count == 0 ? 0 : totals[0].Count, Values(request.Aggregates, totals.Count == 0 ? null : totals[0]), Array.Empty<CanopySummaryGroup>());
        }
        // One grouped scan: the complete-query values are combined from the groups instead of scanning again.
        var stored = await translator.GroupsAsync(filtered, request.GroupColumn.Id, request.Aggregates, 10001, Executor, cancellationToken).ConfigureAwait(false);
        var groups = stored.Select(group => new CanopySummaryGroup(group.Key, group.Count, Values(request.Aggregates, group))).ToList();
        var matched = stored.Sum(group => group.Count);
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
        }        return new CanopySummaryResult(matched, aggregates, groups);
    }

    private static Dictionary<string, double?> Values(IReadOnlyList<CanopySummaryAggregate> aggregates, QueryTranslator<T>.StoreGroup? group) {
        var values = new Dictionary<string, double?>(StringComparer.Ordinal);
        for (var i = 0; i < aggregates.Count; i++)
            values[aggregates[i].Id] = group == null ? aggregates[i].Operation == CanopyGridAggregateOperation.Count ? 0 : (double?)null : group.Values[i];
        return values;
    }

    private bool Grouped(CanopyDataRequest request) {
        var grouping = Schema.Grouping;
        return grouping != null && request.Sort.Count > 0 && request.Sort[0].Column.Id == grouping.Column;
    }

    /// <summary>Reads a window of a grouped view group by group, so record order follows the protocol's group order.</summary>
    private async Task<List<CanopyGridRow>> GroupedRowsAsync(QueryTranslator<T> translator, IQueryable<T> filtered, CanopyDataRequest request, int take,
        List<string> columns, CancellationToken cancellationToken) {
        var column = Schema.Grouping!.Column;
        var groups = await translator.GroupsAsync(filtered, column, Array.Empty<CanopySummaryAggregate>(), 10001, Executor, cancellationToken).ConfigureAwait(false);
        if (groups.Count > 10000) throw CanopyRequestException.Limit("The result has more groups than the protocol allows.");
        var compare = Schema.Grouping.CreateComparer(Schema.View);
        groups.Sort((left, right) => compare.Compare(CanopyDataValues.ToCell(left.Value)!, CanopyDataValues.ToCell(right.Value)!));
        // The window covers a contiguous run of groups: few groups are read slice by slice, many in one query ranked by group order.
        var overlapping = new List<(QueryTranslator<T>.StoreGroup Group, int Start)>();
        var start = 0;
        var end = request.Offset + take;
        foreach (var group in groups) {
            var stop = start + group.Count;
            if (stop > request.Offset && start < end) overlapping.Add((group, start));
            if (stop >= end) break;
            start = stop;
        }
        var rest = request.Sort.Skip(1).ToList();
        var value = translator.Value(column);
        Expression Match(QueryTranslator<T>.StoreGroup group) => group.Key == null ? ExpressionTools.IsNull(value) : Expression.Equal(value, ExpressionTools.Parameter(group.Key, value.Type));
        var rows = new List<CanopyGridRow>(take);
        if (overlapping.Count > 8) {
            if (overlapping.Count > 1000) throw CanopyRequestException.Limit("The page spans too many groups; request a smaller page.");
            var tests = overlapping.Select(item => Match(item.Group)).ToList();
            Expression? any = null;
            foreach (var test in tests) any = ExpressionTools.Or(any, test);
            var members = filtered.Where(Expression.Lambda<Func<T, bool>>(any!, translator.Row));
            var ranked = translator.Order(members, rest, QueryTranslator<T>.Rank(value, tests));
            return await RowsAsync(translator, ranked.Skip(request.Offset - overlapping[0].Start).Take(take), columns, cancellationToken).ConfigureAwait(false);
        }
        foreach (var (group, first) in overlapping) {
            var skip = Math.Max(0, request.Offset - first);
            var count = Math.Min(first + group.Count, end) - (first + skip);
            var members = filtered.Where(Expression.Lambda<Func<T, bool>>(Match(group), translator.Row));
            rows.AddRange(await RowsAsync(translator, translator.Order(members, rest).Skip(skip).Take(count), columns, cancellationToken).ConfigureAwait(false));
        }
        return rows;
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
