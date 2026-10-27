using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>The reference implementation of <see cref="ICanopyDataProvider"/>: exact protocol semantics over records in memory.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// This provider evaluates requests directly, without a LINQ provider, and shows what an implementation for another back
/// end has to do: filter with the protocol's folding and null rules, search the searchable columns, order with missing
/// values last and the record identity as the final key, count, window, build value lists and aggregate. Its text matching
/// uses <see cref="CanopyTextFolding"/> and its text order is ordinal (or the column's ordering policy), exactly as the
/// browser runtime evaluates an inline grid, so it doubles as the oracle that database providers are tested against.
/// </para>
/// <para>Each request reads the records again; use it for modest datasets, fixtures and tests.</para>
/// </remarks>
public sealed partial class CanopyInMemoryProvider<T> : ICanopyDataProvider, ICanopyRangeProvider, ICanopyPivotProvider {
    private readonly Func<IEnumerable<T>> _records;
    private readonly Func<T, string> _id;
    private readonly Func<T, object?>[] _values;
    private readonly Func<string> _revision;

    /// <summary>Creates a provider.</summary>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="records">Returns the records, read once per request.</param>
    /// <param name="id">Returns a record's stable identity.</param>
    /// <param name="values">Returns a record's raw value for each schema column. A value may be a <see cref="CanopyCell"/>,
    /// whose <see cref="CanopyCell.Value"/> is the raw value and whose display fields are written as they are.
    /// Calculated columns need no accessor; their expressions use the captured schema and run before querying.
    /// Inputs outside the allowed output columns need accessors when an allowed calculation depends on them.</param>
    /// <param name="revision">Returns the dataset revision; null uses the constant <c>memory</c>.</param>
    public CanopyInMemoryProvider(CanopyDataSchema schema, Func<IEnumerable<T>> records, Func<T, string> id,
        IReadOnlyDictionary<string, Func<T, object?>> values, Func<string>? revision = null) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        _records = records ?? throw new ArgumentNullException(nameof(records));
        _id = id ?? throw new ArgumentNullException(nameof(id));
        if (values == null) throw new ArgumentNullException(nameof(values));
        _values = new Func<T, object?>[schema.Columns.Count];
        foreach (var column in schema.Columns) {
            if (schema.ProtocolView.GetColumn(column.Id).Calculation != null) { _values[column.Ordinal] = _ => null; continue; }
            if (!values.TryGetValue(column.Id, out var accessor) || accessor == null) throw new ArgumentException("Column '" + column.Id + "' needs a value accessor.", nameof(values));
            _values[column.Ordinal] = accessor;
        }
        InitializeCalculations(values);
        _revision = revision ?? (() => "memory");
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

    /// <inheritdoc />
    public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var revision = _revision();
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<string>(revision);
    }

    /// <inheritdoc />
    public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        var all = Load(cancellationToken);
        var selected = Select(all, request, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var matches = Arrange(selected, request, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var rows = matches.Skip(request.Offset).Take(request.Limit).Select(record => {
            cancellationToken.ThrowIfCancellationRequested();
            return Row(record, cancellationToken);
        });
        var result = new CanopyPageResult(all.Count, matches.Count, rows);
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<CanopyPageResult>(result);
    }

    /// <inheritdoc />
    public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        var count = Select(Load(cancellationToken), request, cancellationToken).Count;
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<int>(count);
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, [EnumeratorCancellation] CancellationToken cancellationToken) {
        Own(request);
        await Task.Yield();
        var selected = Select(Load(cancellationToken), request, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var records = Arrange(selected, request, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        foreach (var record in records.Skip(request.Offset).Take(request.Limit)) {
            cancellationToken.ThrowIfCancellationRequested();
            yield return Row(record, cancellationToken);
        }
    }

    /// <inheritdoc />
    public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var matches = Select(Load(cancellationToken), request.Query, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var ordinal = request.Column.Ordinal;
        var term = CanopyTextFolding.Fold(request.Search)!;
        var buckets = new Dictionary<string, (object? Value, int Count)>(StringComparer.Ordinal);
        foreach (var record in matches) {
            cancellationToken.ThrowIfCancellationRequested();
            var value = request.Bucket == null ? record.Values[ordinal] : request.Bucket.Key(record.Values[ordinal]);
            var label = request.Bucket == null ? request.Column.FacetSearchValue(value) : value == null ? null : request.Bucket.Label((double)value);
            if (term.Length > 0 && !ProtocolSemantics.ContainsTerm(label, term)) continue;
            var key = CanopyQueryableProvider<T>.FacetKey(value, request.Column.ExactCategoryTokens);
            buckets[key] = buckets.TryGetValue(key, out var existing)
                ? (string.CompareOrdinal(existing.Value as string, value as string) <= 0 ? existing.Value : value, existing.Count + 1)
                : (value, 1);
        }
        var ordered = buckets.Values.OrderBy(bucket => {
            cancellationToken.ThrowIfCancellationRequested();
            return bucket.Value;
        }, request.Bucket == null ? FacetOrder.ForColumn(request.Column) : Comparer<object?>.Create((left, right) => CanopyBucket.CompareKeys(left, right, false))).Take(request.Limit).Select(bucket => {
            cancellationToken.ThrowIfCancellationRequested();
            return new CanopyFacetBucket(bucket.Value, bucket.Count);
        });
        var result = new CanopyFacetResult(matches.Count, buckets.Count, ordered);
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<CanopyFacetResult>(result);
    }

    /// <inheritdoc />
    /// <remarks>The overlap is evaluated directly on the normalized values (UTC milliseconds), independently of
    /// <see cref="CanopyRangeRequest.Selection"/>, so this provider doubles as the oracle of the range semantics.</remarks>
    public ValueTask<CanopyRangeResult> RangeAsync(CanopyRangeRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var from = request.From.Ticks / TimeSpan.TicksPerMillisecond;
        var to = request.To.Ticks / TimeSpan.TicksPerMillisecond;
        long? At(Record record, CanopyDataColumn? column) => column != null && record.Values[column.Ordinal] is DateTime date ? date.Ticks / TimeSpan.TicksPerMillisecond : (long?)null;
        bool Overlaps(Record record) {
            var start = At(record, request.Start);
            if (start == null || start.Value >= to) return false;
            var rule = request.Recurrence == null ? null : record.Values[request.Recurrence.Ordinal];
            if (rule == null || rule is string text && text.Length == 0) {
                if (start.Value >= from) return true;
                var end = At(record, request.End);
                return end != null && end.Value > from;
            }
            if (request.SeriesEnd == null) return true;
            var last = At(record, request.SeriesEnd);
            return last == null || last.Value > from;
        }
        var resources = request.Resources?.Cast<object>().ToList();
        var matches = Select(Load(cancellationToken), request.Query, cancellationToken).Where(record =>
            (resources == null || ProtocolSemantics.Matches(record.Values[request.Resource!.Ordinal], request.Resource.Kind, CanopyGridFilterOperator.In, resources)) && Overlaps(record)).ToList();
        var ordered = matches.Select(record => (Record: record, Start: At(record, request.Start)!.Value)).ToArray();
        Array.Sort(ordered, (left, right) => left.Start != right.Start ? left.Start.CompareTo(right.Start) : string.CompareOrdinal(left.Record.Id, right.Record.Id));
        var rows = ordered.Take(request.Limit).Select(item => Row(item.Record, cancellationToken));
        return new ValueTask<CanopyRangeResult>(new CanopyRangeResult(matches.Count, rows));
    }

    /// <inheritdoc />
    public ValueTask<CanopyPivotResult> PivotAsync(CanopyPivotRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        foreach (var aggregate in request.Aggregates) Supported(aggregate);
        var records = Select(Load(cancellationToken), request.Query, cancellationToken);
        var result = CanopyPivot.Compute(Schema.ProtocolView, request.Definition, records.Select(record => Row(record, cancellationToken)));
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<CanopyPivotResult>(result);
    }

    /// <inheritdoc />
    public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        foreach (var aggregate in request.Aggregates) Supported(aggregate);
        var matches = Select(Load(cancellationToken), request.Query, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var groups = request.Levels.Count == 0 ? new List<CanopySummaryGroup>() : Groups(request, matches, 0, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var result = new CanopySummaryResult(matches.Count, Aggregate(request, matches, cancellationToken), groups);
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<CanopySummaryResult>(result);
    }

    /// <summary>The groups of one level over some records, each with the groups of the next level; the handler orders them.</summary>
    private static List<CanopySummaryGroup> Groups(CanopySummaryRequest request, List<Record> records, int depth, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var level = request.Levels[depth];
        var ordinal = level.Column.Ordinal;
        var groups = new List<CanopySummaryGroup>();
        foreach (var group in records.GroupBy(record => {
            cancellationToken.ThrowIfCancellationRequested();
            return CanopyRemoteHandler.GroupKey(level.Key(record.Values[ordinal]));
        }, StringComparer.Ordinal)) {
            cancellationToken.ThrowIfCancellationRequested();
            var members = group.ToList();
            var inner = depth + 1 < request.Levels.Count ? Groups(request, members, depth + 1, cancellationToken) : null;
            groups.Add(new CanopySummaryGroup(level.Key(members[0].Values[ordinal]), members.Count, Aggregate(request, members, cancellationToken), inner));
        }
        return groups;
    }

    private static Dictionary<string, double?> Aggregate(CanopySummaryRequest request, IReadOnlyList<Record> records, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var values = new Dictionary<string, double?>(StringComparer.Ordinal);
        foreach (var aggregate in request.Aggregates) values[aggregate.Id] = Aggregate(aggregate, records, cancellationToken);
        return values;
    }

    private static double? Aggregate(CanopySummaryAggregate aggregate, IReadOnlyList<Record> records, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        Supported(aggregate);
        var definition = new CanopyGridAggregate(aggregate.Id, aggregate.Column.Id, aggregate.Operation, aggregate.Id);
        return definition.Evaluate(records.Select(record => {
            cancellationToken.ThrowIfCancellationRequested();
            return CanopyDataValues.ToCell(record.Values[aggregate.Column.Ordinal]);
        }));
    }

    private static void Supported(CanopySummaryAggregate aggregate) {
        if (aggregate.Operation == CanopyGridAggregateOperation.Custom) throw Unsupported(aggregate);
    }

    private static CanopyRequestException Unsupported(CanopySummaryAggregate aggregate) =>
        new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not compute the custom aggregate '" + aggregate.CustomOperation + "'.");

    private List<Record> Load(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var source = _records();
        cancellationToken.ThrowIfCancellationRequested();
        var list = new List<Record>();
        using var items = source.GetEnumerator();
        while (true) {
            // Host enumeration and accessors can be slow or cancel the request themselves. Check both sides,
            // including a final MoveNext(false), before invoking another callback or allocating another row.
            cancellationToken.ThrowIfCancellationRequested();
            var more = items.MoveNext();
            cancellationToken.ThrowIfCancellationRequested();
            if (!more) break;
            var item = items.Current;
            cancellationToken.ThrowIfCancellationRequested();
            if (_calculations != null) {
                list.Add(LoadCalculated(item, cancellationToken));
                continue;
            }
            var cells = new CanopyCell?[_values.Length];
            var raw = new object?[_values.Length];
            for (var i = 0; i < _values.Length; i++) {
                cancellationToken.ThrowIfCancellationRequested();
                var value = _values[i](item);
                cancellationToken.ThrowIfCancellationRequested();
                cells[i] = value as CanopyCell ?? CanopyDataValues.ToCell(value);
                raw[i] = CanopyDataValues.Normalize(value is CanopyCell cell ? cell.Value : value);
            }
            cancellationToken.ThrowIfCancellationRequested();
            var id = _id(item);
            cancellationToken.ThrowIfCancellationRequested();
            list.Add(new Record(id, raw, cells));
        }
        return list;
    }

    private List<Record> Select(List<Record> records, CanopyDataRequest request, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        RejectCustomFilters(request.Filter);
        var ids = request.Ids == null ? null : new HashSet<string>(StringComparer.Ordinal);
        if (request.Ids != null) foreach (var id in request.Ids) {
            cancellationToken.ThrowIfCancellationRequested();
            ids!.Add(id);
        }
        var excluded = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in request.ExcludedIds) {
            cancellationToken.ThrowIfCancellationRequested();
            excluded.Add(id);
        }
        var terms = request.SearchTerms.Select(term => {
            cancellationToken.ThrowIfCancellationRequested();
            return CanopyTextFolding.Fold(term)!;
        }).ToList();
        return records.Where(record => {
            cancellationToken.ThrowIfCancellationRequested();
            return (ids == null || ids.Contains(record.Id)) && !excluded.Contains(record.Id) &&
                terms.All(term => Schema.SearchColumns.Any(column => {
                    cancellationToken.ThrowIfCancellationRequested();
                    return ProtocolSemantics.ContainsTerm(record.Values[column.Ordinal], term);
                })) && (request.Filter == null || Matches(record, request.Filter, cancellationToken)) && request.TupleFilters.All(tuple => tuple.Matches(column => record.Values[column.Ordinal]));
        }).ToList();
    }

    private static void RejectCustomFilters(CanopyFilterNode? node) {
        if (node is CanopyFilterCondition condition && condition.Operator == CanopyGridFilterOperator.Custom)
            throw new CanopyRequestException(CanopyRequestError.Unsupported, "A named filter requires a host provider that implements it.");
        if (node is CanopyFilterGroup group) foreach (var child in group.Children) RejectCustomFilters(child);
    }

    private static bool Matches(Record record, CanopyFilterNode node, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        return node switch {
            CanopyFilterConstant constant => constant.Value,
            CanopyFilterCondition condition => ProtocolSemantics.Matches(condition.Bucket == null ? record.Values[condition.Column.Ordinal] : condition.Bucket.Key(record.Values[condition.Column.Ordinal]), condition.Bucket == null ? condition.Column.Kind : CanopyColumnKind.Number, condition.Operator, condition.Values, condition.Column.ExactCategoryTokens),
            CanopyFilterGroup group => group.Junction == CanopyGridFilterJunction.All
                ? group.Children.All(child => Matches(record, child, cancellationToken))
                : group.Children.Any(child => Matches(record, child, cancellationToken)),
            _ => false
        };
    }

    /// <summary>Orders matching records: level by level (each level's groups in their order: by value, or by an aggregate of the
    /// group), then by the other sort keys inside the innermost groups, and by record identity last.</summary>
    private List<Record> Arrange(List<Record> records, CanopyDataRequest request, CancellationToken cancellationToken) =>
        request.Levels.Count == 0 ? Order(records, request.ProviderSort(), cancellationToken) : Arrange(records, request.Levels, 0, request.ProviderSort(insideGroups: true), cancellationToken);

    private List<Record> Arrange(List<Record> records, IReadOnlyList<CanopySummaryLevel> levels, int depth, IReadOnlyList<CanopySortKey> inner, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (depth == levels.Count) return Order(records, inner, cancellationToken);
        var level = levels[depth];
        var ordinal = level.Column.Ordinal;
        if (level.Aggregate != null) Supported(level.Aggregate);
        var groups = records.GroupBy(record => {
            cancellationToken.ThrowIfCancellationRequested();
            return CanopyRemoteHandler.GroupKey(level.Key(record.Values[ordinal]));
        }, StringComparer.Ordinal).Select(group => {
            cancellationToken.ThrowIfCancellationRequested();
            var members = group.ToList();
            return (Value: level.Key(members[0].Values[ordinal]), Members: members, Aggregate: level.Aggregate == null ? null : Aggregate(level.Aggregate, members, cancellationToken));
        }).ToList();
        cancellationToken.ThrowIfCancellationRequested();
        groups.Sort(GroupOrdering.Create<(object? Value, List<Record> Members, double? Aggregate)>(Schema, level, group => group.Value, group => group.Aggregate));
        cancellationToken.ThrowIfCancellationRequested();
        var ordered = new List<Record>(records.Count);
        foreach (var group in groups) {
            cancellationToken.ThrowIfCancellationRequested();
            ordered.AddRange(Arrange(group.Members, levels, depth + 1, inner, cancellationToken));
        }
        return ordered;
    }

    private static List<Record> Order(List<Record> records, IReadOnlyList<CanopySortKey> sort, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var ordered = records.ToArray();
        cancellationToken.ThrowIfCancellationRequested();
        // A stable sort over an explicit comparison; identity is the last key, so the order is total.
        Array.Sort(ordered, (left, right) => {
            foreach (var key in sort) {
                var a = left.Values[key.Column.Ordinal];
                var b = right.Values[key.Column.Ordinal];
                var compared = ProtocolSemantics.Compare(a, b, key.Column.Kind, key.Column.Ordering, key.Column.ValueOrder);
                if (compared != 0) return key.Descending && a != null && b != null ? -compared : compared;
            }
            return CanopyRowIdentity.Compare(left.Id, right.Id);
        });
        cancellationToken.ThrowIfCancellationRequested();
        return ordered.ToList();
    }

    private CanopyGridRow Row(Record record, CancellationToken cancellationToken) {
        var row = new CanopyGridRow(record.Id);
        foreach (var column in Schema.Columns) {
            cancellationToken.ThrowIfCancellationRequested();
            row.Cells[column.Id] = record.Cells[column.Ordinal]!;
        }
        return row;
    }

    private void Own(CanopyDataRequest request) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        if (!ReferenceEquals(request.Schema, Schema)) throw new ArgumentException("The request belongs to another schema.", nameof(request));
    }

    private sealed class Record {
        internal Record(string id, object?[] values, CanopyCell?[] cells) { Id = id; Values = values; Cells = cells; }
        internal string Id { get; }
        internal object?[] Values { get; }
        internal CanopyCell?[] Cells { get; }
    }
}
