using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>The allow-list that maps protocol column identities to expressions over a record type.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// Only mapped columns can be sorted, filtered, searched, grouped or exported, and only through their expressions;
/// a request can never reach an unmapped property. Each mapped identity must be declared by the grid view with a kind
/// that fits the expression type: text columns map strings, booleans and enumerations, number columns integers,
/// floating-point and decimal values, and date columns <see cref="DateTime"/>, <see cref="DateTimeOffset"/> and date-only values.
/// <code>
/// var map = new CanopyColumnMap&lt;Host&gt;(view)
///     .Key(x =&gt; x.Id)
///     .Column("name", x =&gt; x.Name)
///     .Column("owner", x =&gt; x.Owner.Name)
///     .Column("lastSeen", x =&gt; x.LastSeen);
/// </code>
/// The map is frozen when <see cref="Schema"/> is first read.
/// </remarks>
public sealed class CanopyColumnMap<T> {
    private readonly List<MappedColumn> _columns = new List<MappedColumn>();
    private readonly Dictionary<string, MappedColumn> _byId = new Dictionary<string, MappedColumn>(StringComparer.Ordinal);
    private readonly System.Collections.Concurrent.ConcurrentDictionary<int, QueryTranslator<T>> _translators = new System.Collections.Concurrent.ConcurrentDictionary<int, QueryTranslator<T>>();
    private CanopyDataSchema? _schema;

    /// <summary>Creates a map for a grid view.</summary>
    /// <param name="view">The grid definition.</param>
    public CanopyColumnMap(CanopyDataGridView view) {
        View = view ?? throw new ArgumentNullException(nameof(view));
    }

    /// <summary>Gets the grid definition.</summary>
    public CanopyDataGridView View { get; }

    /// <summary>Gets the stable record key expression.</summary>
    public LambdaExpression? KeyExpression { get; private set; }

    internal IReadOnlyList<MappedColumn> Columns => _columns;

    internal Action<CanopyGridRow>? Decorator { get; private set; }

    /// <summary>Gets the schema of the mapped columns, freezing the map.</summary>
    /// <exception cref="InvalidOperationException">No key is mapped.</exception>
    public CanopyDataSchema Schema {
        get {
            if (_schema != null) return _schema;
            if (KeyExpression == null) throw new InvalidOperationException("Map the stable record key with Key() before using the map.");
            return _schema = new CanopyDataSchema(View, _columns.Select(column => column.Id), _columns.Where(column => !column.Filterable).Select(column => column.Id));
        }
    }

    /// <summary>Maps the stable record key. Row identities are its invariant text; it is the final sort key.</summary>
    /// <typeparam name="TKey">The key type.</typeparam>
    /// <param name="key">The key expression, unique across the dataset.</param>
    /// <returns>This map.</returns>
    public CanopyColumnMap<T> Key<TKey>(Expression<Func<T, TKey>> key) {
        Mutable();
        KeyExpression = key ?? throw new ArgumentNullException(nameof(key));
        return this;
    }

    /// <summary>Maps a declared view column to an expression.</summary>
    /// <typeparam name="TValue">The value type.</typeparam>
    /// <param name="id">The declared column identity.</param>
    /// <param name="value">The value expression.</param>
    /// <param name="configure">Optional sorting, search, formatting and filter settings.</param>
    /// <returns>This map.</returns>
    /// <exception cref="ArgumentException">The column is undeclared, already mapped, or its kind does not fit the value type.</exception>
    public CanopyColumnMap<T> Column<TValue>(string id, Expression<Func<T, TValue>> value, Action<CanopyColumnMapping<T, TValue>>? configure = null) {
        Mutable();
        if (value == null) throw new ArgumentNullException(nameof(value));
        var declared = View.Columns.FirstOrDefault(column => column.Id == id) ?? throw new ArgumentException("Column '" + id + "' is not declared by view '" + View.Id + "'.", nameof(id));
        if (_byId.ContainsKey(id)) throw new ArgumentException("Column '" + id + "' is already mapped.", nameof(id));
        var shape = ValueShapes.Of(typeof(TValue), id);
        if (!ValueShapes.Fits(shape, declared.Kind)) throw new ArgumentException("Column '" + id + "' is a " + declared.Kind + " column and cannot map " + typeof(TValue).Name + ".", nameof(value));
        if (shape == ValueShape.Enum) _ = EnumDomains.Members(ExpressionTools.Underlying(typeof(TValue)));
        var column = new MappedColumn(id, value, shape);
        configure?.Invoke(new CanopyColumnMapping<T, TValue>(column));
        _columns.Add(column);
        _byId.Add(id, column);
        return this;
    }

    /// <summary>Adjusts every written row after its cells are set, for example to add a row tone or class.</summary>
    /// <param name="decorate">The row callback.</param>
    /// <returns>This map.</returns>
    public CanopyColumnMap<T> DecorateRows(Action<CanopyGridRow> decorate) {
        Mutable();
        Decorator = decorate ?? throw new ArgumentNullException(nameof(decorate));
        return this;
    }

    internal MappedColumn Get(string id) => _byId[id];

    /// <summary>Translators bind the mapped expressions once per comparison mode and store kind, shared by every provider of this map.</summary>
    internal QueryTranslator<T> Translator(CanopyTextComparison comparison, bool nullSafe) {
        _ = Schema;
        return _translators.GetOrAdd((int)comparison * 2 + (nullSafe ? 1 : 0), _ => new QueryTranslator<T>(this, comparison, nullSafe));
    }

    private void Mutable() {
        if (_schema != null) throw new InvalidOperationException("The map is frozen once its schema is in use.");
    }
}
