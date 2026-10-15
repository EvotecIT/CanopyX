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
public sealed class CanopyInMemoryProvider<T> : ICanopyDataProvider {
    private readonly Func<IEnumerable<T>> _records;
    private readonly Func<T, string> _id;
    private readonly Func<T, object?>[] _values;
    private readonly Func<string> _revision;

    /// <summary>Creates a provider.</summary>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="records">Returns the records, read once per request.</param>
    /// <param name="id">Returns a record's stable identity.</param>
    /// <param name="values">Returns a record's raw value for each schema column. A value may be a <see cref="CanopyCell"/>,
    /// whose <see cref="CanopyCell.Value"/> is the raw value and whose display fields are written as they are.</param>
    /// <param name="revision">Returns the dataset revision; null uses the constant <c>memory</c>.</param>
    public CanopyInMemoryProvider(CanopyDataSchema schema, Func<IEnumerable<T>> records, Func<T, string> id,
        IReadOnlyDictionary<string, Func<T, object?>> values, Func<string>? revision = null) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        _records = records ?? throw new ArgumentNullException(nameof(records));
        _id = id ?? throw new ArgumentNullException(nameof(id));
        if (values == null) throw new ArgumentNullException(nameof(values));
        _values = new Func<T, object?>[schema.Columns.Count];
        foreach (var column in schema.Columns) {
            if (!values.TryGetValue(column.Id, out var accessor) || accessor == null) throw new ArgumentException("Column '" + column.Id + "' needs a value accessor.", nameof(values));
            _values[column.Ordinal] = accessor;
        }
        _revision = revision ?? (() => "memory");
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

    /// <inheritdoc />
    public ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        return new ValueTask<string>(_revision());
    }

    /// <inheritdoc />
    public ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        var all = Load(cancellationToken);
        var matches = Order(Select(all, request), request.Sort);
        var rows = matches.Skip(request.Offset).Take(request.Limit).Select(Row);
        return new ValueTask<CanopyPageResult>(new CanopyPageResult(all.Count, matches.Count, rows));
    }

    /// <inheritdoc />
    public ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken) {
        Own(request);
        return new ValueTask<int>(Select(Load(cancellationToken), request).Count);
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, [EnumeratorCancellation] CancellationToken cancellationToken) {
        Own(request);
        await Task.Yield();
        foreach (var record in Order(Select(Load(cancellationToken), request), request.Sort).Skip(request.Offset).Take(request.Limit)) {
            cancellationToken.ThrowIfCancellationRequested();
            yield return Row(record);
        }
    }

    /// <inheritdoc />
    public ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var matches = Select(Load(cancellationToken), request.Query);
        var ordinal = request.Column.Ordinal;
        var term = CanopyTextFolding.Fold(request.Search)!;
        var buckets = new Dictionary<string, (object? Value, int Count)>(StringComparer.Ordinal);
        foreach (var record in matches) {
            var value = record.Values[ordinal];
            if (term.Length > 0 && !ProtocolSemantics.ContainsTerm(value, term)) continue;
            var key = CanopyQueryableProvider<T>.FacetKey(value);
            buckets[key] = buckets.TryGetValue(key, out var existing)
                ? (string.CompareOrdinal(existing.Value as string, value as string) <= 0 ? existing.Value : value, existing.Count + 1)
                : (value, 1);
        }
        var ordered = buckets.Values.OrderBy(bucket => bucket.Value, FacetOrder.Instance).Take(request.Limit).Select(bucket => new CanopyFacetBucket(bucket.Value, bucket.Count));
        return new ValueTask<CanopyFacetResult>(new CanopyFacetResult(matches.Count, buckets.Count, ordered));
    }

    /// <inheritdoc />
    public ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var matches = Select(Load(cancellationToken), request.Query);
        var groups = new List<CanopySummaryGroup>();
        if (request.GroupColumn != null) {
            var ordinal = request.GroupColumn.Ordinal;
            foreach (var group in matches.GroupBy(record => CanopyRemoteHandler.GroupKey(record.Values[ordinal]), StringComparer.Ordinal)) {
                var members = group.ToList();
                groups.Add(new CanopySummaryGroup(members[0].Values[ordinal], members.Count, Aggregate(request, members)));
            }
        }
        return new ValueTask<CanopySummaryResult>(new CanopySummaryResult(matches.Count, Aggregate(request, matches), groups));
    }

    private static Dictionary<string, double?> Aggregate(CanopySummaryRequest request, IReadOnlyList<Record> records) {
        var values = new Dictionary<string, double?>(StringComparer.Ordinal);
        foreach (var aggregate in request.Aggregates) {
            var ordinal = aggregate.Column.Ordinal;
            int count = 0;
            double sum = 0, compensation = 0, minimum = double.MaxValue, maximum = double.MinValue;
            foreach (var record in records) {
                var raw = record.Values[ordinal];
                if (raw == null) continue;
                count++;
                if (aggregate.Operation == CanopyGridAggregateOperation.Count) continue;
                var number = CanopyDataValues.ToDouble(raw);
                // Neumaier's compensated summation, as the browser runtime sums inline groups.
                var total = sum + number;
                compensation += Math.Abs(sum) >= Math.Abs(number) ? sum - total + number : number - total + sum;
                sum = total;
                minimum = Math.Min(minimum, number);
                maximum = Math.Max(maximum, number);
            }
            values[aggregate.Id] = aggregate.Operation switch {
                CanopyGridAggregateOperation.Count => count,
                _ when count == 0 => null,
                CanopyGridAggregateOperation.Sum => sum + compensation,
                CanopyGridAggregateOperation.Average => (sum + compensation) / count,
                CanopyGridAggregateOperation.Minimum => minimum,
                _ => maximum
            };
        }
        return values;
    }

    private List<Record> Load(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var list = new List<Record>();
        foreach (var item in _records()) {
            var cells = new CanopyCell?[_values.Length];
            var raw = new object?[_values.Length];
            for (var i = 0; i < _values.Length; i++) {
                var value = _values[i](item);
                cells[i] = value as CanopyCell ?? CanopyDataValues.ToCell(value);
                raw[i] = CanopyDataValues.Normalize(value is CanopyCell cell ? cell.Value : value);
            }
            list.Add(new Record(_id(item), raw, cells));
        }
        return list;
    }

    private List<Record> Select(List<Record> records, CanopyDataRequest request) {
        var ids = request.Ids == null ? null : new HashSet<string>(request.Ids, StringComparer.Ordinal);
        var excluded = new HashSet<string>(request.ExcludedIds, StringComparer.Ordinal);
        var terms = request.SearchTerms.Select(term => CanopyTextFolding.Fold(term)!).ToList();
        return records.Where(record => (ids == null || ids.Contains(record.Id)) && !excluded.Contains(record.Id) &&
            terms.All(term => Schema.SearchColumns.Any(column => ProtocolSemantics.ContainsTerm(record.Values[column.Ordinal], term))) &&
            (request.Filter == null || Matches(record, request.Filter))).ToList();
    }

    private static bool Matches(Record record, CanopyFilterNode node) => node switch {
        CanopyFilterConstant constant => constant.Value,
        CanopyFilterCondition condition => ProtocolSemantics.Matches(record.Values[condition.Column.Ordinal], condition.Column.Kind, condition.Operator, condition.Values),
        CanopyFilterGroup group => group.Junction == CanopyGridFilterJunction.All
            ? group.Children.All(child => Matches(record, child))
            : group.Children.Any(child => Matches(record, child)),
        _ => false
    };

    private static List<Record> Order(List<Record> records, IReadOnlyList<CanopySortKey> sort) {
        var ordered = records.ToArray();
        // A stable sort over an explicit comparison; identity is the last key, so the order is total.
        Array.Sort(ordered, (left, right) => {
            foreach (var key in sort) {
                var a = left.Values[key.Column.Ordinal];
                var b = right.Values[key.Column.Ordinal];
                var compared = ProtocolSemantics.Compare(a, b, key.Column.Kind, key.Column.Ordering);
                if (compared != 0) return key.Descending && a != null && b != null ? -compared : compared;
            }
            return string.CompareOrdinal(left.Id, right.Id);
        });
        return ordered.ToList();
    }

    private CanopyGridRow Row(Record record) {
        var row = new CanopyGridRow(record.Id);
        foreach (var column in Schema.Columns) row.Cells[column.Id] = record.Cells[column.Ordinal]!;
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
