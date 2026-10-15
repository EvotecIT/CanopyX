using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Loads record details over any <see cref="IQueryable{T}"/>: EF Core, LINQ to objects or another LINQ provider.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// The record is found with <c>Where(key == id)</c> on the query the grid reads (the caller's scope), with the identity
/// converted to the key type as a query parameter; an identity that is not the canonical text of a key finds nothing. One
/// query reads the record's value fields, drawer values and, when asked, its row (projected to those values only). Each
/// collection then costs a count and a window, each timeline or change list one window, all read through the record found
/// (<c>SelectMany</c> over its navigation), never from a table of their own. A collection page checks the record exists first.
/// </para>
/// <para>Fields the caller may not read are not queried at all.</para>
/// </remarks>
public sealed class CanopyQueryableRecordProvider<T> : ICanopyRecordProvider {
    private readonly Func<IQueryable<T>> _source;
    private readonly CanopyQueryOptions _options;

    /// <summary>Creates a provider over a query factory, called once per request (for example per database context).</summary>
    /// <param name="source">Returns the base query, already restricted to what the caller may see: the grid's own query callback.</param>
    /// <param name="map">The record allow-list.</param>
    /// <param name="options">Execution options (the executor); text comparison and revision do not apply to records.</param>
    public CanopyQueryableRecordProvider(Func<IQueryable<T>> source, CanopyRecordMap<T> map, CanopyQueryOptions? options = null) {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        Map = map ?? throw new ArgumentNullException(nameof(map));
        _options = options ?? new CanopyQueryOptions();
        _ = map.Schema;
    }

    /// <summary>Creates a provider over one query.</summary>
    /// <param name="source">The base query, already restricted to what the caller may see.</param>
    /// <param name="map">The record allow-list.</param>
    /// <param name="options">Execution options.</param>
    public CanopyQueryableRecordProvider(IQueryable<T> source, CanopyRecordMap<T> map, CanopyQueryOptions? options = null)
        : this(Factory(source), map, options) { }

    /// <summary>Gets the record allow-list.</summary>
    public CanopyRecordMap<T> Map { get; }

    /// <inheritdoc />
    public CanopyRecordSchema Schema => Map.Schema;

    private CanopyQueryExecutor Executor => _options.Executor ?? CanopyQueryExecutor.Default;

    /// <inheritdoc />
    public async ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        if (!ReferenceEquals(request.Schema, Schema)) throw new ArgumentException("The request belongs to another record schema.", nameof(request));
        var source = _source();
        var memory = source.Provider is EnumerableQuery;
        var translator = Map.Columns.Translator(memory ? CanopyTextComparison.Canonical : CanopyTextComparison.Lowercase, memory);
        var keyType = ExpressionTools.Underlying(translator.Key.Type);
        var key = RecordKeys.Parse(request.Id, keyType);
        if (key == null) return null;
        // Compared in the key's own type, so a nullable key (or one made null-safe in memory) never fails on a missing value.
        var parameter = ExpressionTools.Parameter(key, keyType);
        if (parameter.Type != translator.Key.Type) parameter = Expression.Convert(parameter, translator.Key.Type);
        var scoped = source.Where(Expression.Lambda<Func<T, bool>>(Expression.Equal(translator.Key, parameter), translator.Row));
        var record = new CanopyGridRecord(request.Id);
        var boxedKey = Expression.Convert(translator.Key, typeof(object));
        var context = new RecordReadContext<T>(source, null, Map.Columns.KeyExpression!, memory, Executor, request.MaxTextLength);

        if (request.Field != null) {
            var keys = await Executor.ToListAsync(scoped.Select(Expression.Lambda<Func<T, object?>>(boxedKey, translator.Row)).Take(2), cancellationToken).ConfigureAwait(false);
            if (!Single(keys, request.Id)) return null;
            var child = (RecordChildMap<T>)Map.Field(request.Field.Id);
            record.Fields[request.Field.Id] = (await child.QueryAsync(scoped, context, request.Offset, request.Limit, request.FirstRows(request.Field), true, cancellationToken).ConfigureAwait(false))!;
            return record;
        }

        // One projection reads the key, every readable value field and drawer value (text read to its bound), whether linked
        // records kept within the grid belong to the caller's query, and the row's columns when asked.
        var parts = new List<Expression> { boxedKey };
        var values = new List<(RecordValueMap<T> Map, int Start, bool Cell, int Scope)>();
        void Add(RecordValueMap<T> map, bool cell) {
            var start = parts.Count;
            for (var i = 0; i < map.Parts.Count; i++) {
                var body = ExpressionTools.Bind(map.Parts[i], translator.Row, memory);
                parts.Add(Expression.Convert(map.IsText(i) ? RecordText.Truncate(body, request.MaxTextLength) : body, typeof(object)));
            }
            var scope = -1;
            if (map.ScopeTarget != null) {
                scope = parts.Count;
                parts.Add(Expression.Convert(context.Exists(ExpressionTools.Bind(map.ScopeTarget, translator.Row, memory)), typeof(object)));
            }
            values.Add((map, start, cell, scope));
        }
        foreach (var field in request.Fields) if (Map.Field(field.Id) is RecordValueMap<T> value) Add(value, false);
        foreach (var column in request.Cells) Add(Map.Cell(column), true);
        var rowStart = parts.Count;
        var rowColumns = request.Row ? Map.Columns.Columns.Select(column => column.Id).ToList() : new List<string>();
        foreach (var column in rowColumns) parts.Add(Expression.Convert(translator.Value(column), typeof(object)));
        var projection = Expression.Lambda<Func<T, object?[]>>(Expression.NewArrayInit(typeof(object), parts), translator.Row);
        var rows = await Executor.ToListAsync(scoped.Select(projection).Take(2), cancellationToken).ConfigureAwait(false);
        if (!Single(rows.Select(row => row[0]).ToList(), request.Id)) return null;
        var found = rows[0];
        foreach (var (map, start, cell, scope) in values) {
            if (scope >= 0 && !(found[scope] is true)) continue;
            for (var i = 0; i < map.Parts.Count; i++) if (map.IsText(i)) found[start + i] = RecordText.Clip(found[start + i], request.MaxTextLength);
            var built = map.Build(found, start);
            if (built == null) continue;
            if (cell) record.Cells[map.Id] = built; else record.Fields[map.Id] = built;
        }
        if (request.Row) {
            var rowValues = new object?[rowColumns.Count + 1];
            rowValues[0] = found[0];
            Array.Copy(found, rowStart, rowValues, 1, rowColumns.Count);
            record.Row = translator.ToRow(rowValues, rowColumns);
        }
        foreach (var field in request.Fields) {
            if (!(Map.Field(field.Id) is RecordChildMap<T> child)) continue;
            var take = child.Collection ? request.FirstRows(field) : Math.Min(child.Size, request.MaxItems);
            var cell = await child.QueryAsync(scoped, context, 0, take, take, false, cancellationToken).ConfigureAwait(false);
            if (cell != null) record.Fields[field.Id] = cell;
        }
        return record;
    }

    /// <summary>Whether the lookup found exactly the record: one key whose identity text is the request's (a store collation that
    /// matches other spellings finds nothing). Two records for one key mean the key is not unique, which is a mapping error.</summary>
    internal static bool Single(IList<object?> keys, string id) {
        if (keys.Count == 0) return false;
        if (keys.Count > 1) throw new InvalidOperationException("The record key is not unique: two records answer one identity.");
        return RecordKeys.Format(keys[0]) == id;
    }

    private static Func<IQueryable<T>> Factory(IQueryable<T> source) {
        if (source == null) throw new ArgumentNullException(nameof(source));
        return () => source;
    }
}
