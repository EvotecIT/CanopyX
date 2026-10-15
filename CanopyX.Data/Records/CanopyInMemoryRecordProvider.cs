using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>The reference implementation of <see cref="ICanopyRecordProvider"/>: a record map evaluated directly over records in memory.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// This provider evaluates the map's expressions as compiled delegates, without a LINQ provider, and shows what an
/// implementation for another back end does: find the one record whose key text is the identity among the records the caller
/// may read, map its fields, and order, count and window its child rows (missing order values last, the child key last, text
/// in ordinal order). It is the oracle that the tests compare EF Core and LINQ to objects with.
/// </para>
/// <para>Each request reads the records again and compares every key; use it for modest datasets, fixtures and tests.</para>
/// </remarks>
public sealed class CanopyInMemoryRecordProvider<T> : ICanopyRecordProvider {
    private readonly Func<IEnumerable<T>> _records;
    private readonly Func<T, object?> _key;
    private readonly Func<T, object?[]> _row;
    private readonly List<string> _rowColumns;
    private readonly QueryTranslator<T> _translator;
    private readonly Dictionary<RecordValueMap<T>, Func<T, object?>[]> _parts = new Dictionary<RecordValueMap<T>, Func<T, object?>[]>();
    private readonly Dictionary<RecordValueMap<T>, Func<T, object?>> _scope = new Dictionary<RecordValueMap<T>, Func<T, object?>>();

    /// <summary>Creates a provider.</summary>
    /// <param name="map">The record allow-list.</param>
    /// <param name="records">Returns the records the caller may read, once per request.</param>
    public CanopyInMemoryRecordProvider(CanopyRecordMap<T> map, Func<IEnumerable<T>> records) {
        Map = map ?? throw new ArgumentNullException(nameof(map));
        _records = records ?? throw new ArgumentNullException(nameof(records));
        _ = map.Schema;
        _translator = map.Columns.Translator(CanopyTextComparison.Canonical, true);
        _key = Expression.Lambda<Func<T, object?>>(Expression.Convert(_translator.Key, typeof(object)), _translator.Row).Compile();
        _rowColumns = map.Columns.Columns.Select(column => column.Id).ToList();
        _row = _translator.Projection(_rowColumns).Compile();
        var record = Expression.Parameter(typeof(T), "record");
        Func<T, object?> Getter(LambdaExpression part) => Expression.Lambda<Func<T, object?>>(Expression.Convert(ExpressionTools.Bind(part, record, true), typeof(object)), record).Compile();
        foreach (var value in map.Fields.OfType<RecordValueMap<T>>().Concat(map.Cells)) {
            _parts[value] = value.Parts.Select(Getter).ToArray();
            if (value.ScopeTarget != null) _scope[value] = Getter(value.ScopeTarget);
        }
    }

    /// <summary>Gets the record allow-list.</summary>
    public CanopyRecordMap<T> Map { get; }

    /// <inheritdoc />
    public CanopyRecordSchema Schema => Map.Schema;

    /// <inheritdoc />
    public ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        if (!ReferenceEquals(request.Schema, Schema)) throw new ArgumentException("The request belongs to another record schema.", nameof(request));
        cancellationToken.ThrowIfCancellationRequested();
        // The same identity rule as the queryable provider: only a key's own text, never text that would not reach a store.
        if (RecordKeys.Parse(request.Id, _translator.Key.Type) == null) return new ValueTask<CanopyGridRecord?>((CanopyGridRecord?)null);
        var matches = new List<T>(2);
        foreach (var item in _records()) {
            if (RecordKeys.Format(_key(item)) != request.Id) continue;
            matches.Add(item);
            if (matches.Count > 1) throw new InvalidOperationException("The record key is not unique: two records answer one identity.");
        }
        if (matches.Count == 0) return new ValueTask<CanopyGridRecord?>((CanopyGridRecord?)null);
        var found = matches[0];
        var record = new CanopyGridRecord(request.Id);
        // The identities of the records the caller may read, for fields kept within the grid; read only when one asks.
        var context = new RecordReadContext<T>(null, () => new HashSet<string>(_records().Select(item => RecordKeys.Format(_key(item))).OfType<string>(), StringComparer.Ordinal),
            Map.Columns.KeyExpression!, true, null, request.MaxTextLength);
        if (request.Field != null) {
            record.Fields[request.Field.Id] = ((RecordChildMap<T>)Map.Field(request.Field.Id)).Evaluate(found, context, request.Offset, request.Limit, request.FirstRows(request.Field), true)!;
            return new ValueTask<CanopyGridRecord?>(record);
        }
        foreach (var field in request.Fields) {
            var map = Map.Field(field.Id);
            CanopyCell? cell;
            if (map is RecordValueMap<T> value) {
                cell = Value(value, found, context);
            } else {
                var child = (RecordChildMap<T>)map;
                var take = child.Collection ? request.FirstRows(field) : Math.Min(child.Size, request.MaxItems);
                cell = child.Evaluate(found, context, 0, take, take, false);
            }
            if (cell != null) record.Fields[field.Id] = cell;
        }
        foreach (var column in request.Cells) {
            var cell = Value(Map.Cell(column), found, context);
            if (cell != null) record.Cells[column] = cell;
        }
        if (request.Row) record.Row = _translator.ToRow(_row(found), _rowColumns);
        return new ValueTask<CanopyGridRecord?>(record);
    }

    private CanopyCell? Value(RecordValueMap<T> map, T record, RecordReadContext<T> context) {
        if (_scope.TryGetValue(map, out var target) && !(RecordKeys.Format(target(record)) is string id && context.Visible.Contains(id))) return null;
        var getters = _parts[map];
        var values = new object?[getters.Length];
        for (var i = 0; i < getters.Length; i++) values[i] = map.IsText(i) ? RecordText.Clip(getters[i](record), context.MaxText) : getters[i](record);
        return map.Build(values, 0);
    }
}
