using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>The allow-list of a record endpoint: record panel fields and columns' drawer values mapped to expressions over the
/// grid's record type, next to its <see cref="CanopyColumnMap{T}"/>.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// Only mapped fields can be read, and only through their expressions; each must be declared by the view's record panel
/// (<see cref="CanopyRecordPanel.Fields"/>), each drawer value by the view's columns. Records are found by the column map's
/// key, so the key must be text, a GUID or an integer.
/// </para>
/// <code>
/// var records = new CanopyRecordMap&lt;Machine&gt;(map)
///     .Field("serial", m =&gt; m.SerialNumber)
///     .Field("purchased", m =&gt; m.PurchasedOn)
///     .Link("replaces", m =&gt; m.ReplacesId, m =&gt; m.Replaces!.Name)
///     .Collection("software", m =&gt; m.Software, list =&gt; list.Key(s =&gt; s.Id).OrderBy(s =&gt; s.Name)
///         .Column(new CanopyColumn("name", "Name"), s =&gt; s.Name).PageSize(25))
///     .Timeline("maintenance", m =&gt; m.Maintenance, events =&gt; events.Key(e =&gt; e.Id).Time(e =&gt; e.At).Summary(e =&gt; e.Summary));
/// </code>
/// <para>
/// Collections, timelines and change lists read the child rows a navigation of the record reaches, always through the record
/// the caller's query found. A navigation that reaches other records (related records, peers) shows what it reaches: when
/// those records have a scope of their own, restrict the navigation in its expression or leave such fields out of the map.
/// The map is frozen when <see cref="Schema"/> is first read.
/// </para>
/// </remarks>
public sealed class CanopyRecordMap<T> {
    private readonly List<RecordFieldMap<T>> _fields = new List<RecordFieldMap<T>>();
    private readonly List<ScalarMap<T>> _cells = new List<ScalarMap<T>>();
    private readonly Dictionary<string, CanopyColumn> _declared = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
    private CanopyRecordSchema? _schema;

    /// <summary>Creates a record map next to a grid's column map.</summary>
    /// <param name="columns">The grid's column allow-list; its view must declare a record panel.</param>
    /// <exception cref="ArgumentException">The view declares no record panel.</exception>
    public CanopyRecordMap(CanopyColumnMap<T> columns) {
        Columns = columns ?? throw new ArgumentNullException(nameof(columns));
        var panel = columns.View.Record ?? throw new ArgumentException("View '" + columns.View.Id + "' declares no record panel (Record).", nameof(columns));
        foreach (var field in panel.Fields) if (field != null && !_declared.ContainsKey(field.Id)) _declared.Add(field.Id, field);
    }

    /// <summary>Gets the grid's column allow-list, whose key finds records and whose columns write the record's row.</summary>
    public CanopyColumnMap<T> Columns { get; }

    /// <summary>Gets the record allow-list of the mapped fields, freezing the map.</summary>
    /// <exception cref="InvalidOperationException">The column map has no key, or its key type cannot be looked up from text.</exception>
    public CanopyRecordSchema Schema {
        get {
            if (_schema != null) return _schema;
            var data = Columns.Schema;
            if (!RecordKeys.Supported(Columns.KeyExpression!.ReturnType)) throw new InvalidOperationException("Records are looked up by the column map's key, which must be text, a GUID or an integer.");
            return _schema = new CanopyRecordSchema(data, _fields.Select(item => item is RecordChildMap<T> child && child.Collection
                ? CanopyRecordField.Collection(item.Id, child.Size) : CanopyRecordField.Value(item.Id)), _cells.Select(cell => cell.Id));
        }
    }

    internal IReadOnlyList<RecordFieldMap<T>> Fields => _fields;

    internal IReadOnlyList<ScalarMap<T>> Cells => _cells;

    internal RecordFieldMap<T> Field(string id) => _fields.First(field => field.Id == id);

    internal ScalarMap<T> Cell(string id) => _cells.First(cell => cell.Id == id);

    /// <summary>Maps a record panel field to a scalar: text, a boolean, an enumeration, a number or a date.</summary>
    /// <typeparam name="TValue">The value type; it must fit the field's kind as column values do.</typeparam>
    /// <param name="id">The record panel field identity.</param>
    /// <param name="value">The value expression.</param>
    /// <param name="format">Creates the cell from the raw value (display text, tone, badges); null converts it as column values are.</param>
    /// <returns>This map.</returns>
    /// <exception cref="ArgumentException">The field is undeclared, already mapped, or its kind does not fit the value type.</exception>
    public CanopyRecordMap<T> Field<TValue>(string id, Expression<Func<T, TValue>> value, Func<TValue, CanopyCell?>? format = null) {
        var declared = Declared(id);
        if (value == null) throw new ArgumentNullException(nameof(value));
        var shape = ValueShapes.Of(typeof(TValue), id);
        if (!ValueShapes.Fits(shape, declared.Kind)) throw new ArgumentException("Field '" + id + "' is a " + declared.Kind + " field and cannot map " + typeof(TValue).Name + ".", nameof(value));
        _fields.Add(new ScalarMap<T>(id, value, Format(format)));
        return this;
    }

    /// <summary>Maps a record panel field to a link that opens a related record.</summary>
    /// <typeparam name="TKey">The related record's key type: text, a GUID or an integer.</typeparam>
    /// <param name="id">The record panel field identity (a text field).</param>
    /// <param name="target">The related record's key; null is an empty field.</param>
    /// <param name="text">The link's text; null or empty shows the related record's identity.</param>
    /// <param name="view">The grid that holds the related record; null for this grid.</param>
    /// <returns>This map.</returns>
    public CanopyRecordMap<T> Link<TKey>(string id, Expression<Func<T, TKey>> target, Expression<Func<T, string?>>? text = null, string? view = null) {
        var declared = Declared(id);
        if (target == null) throw new ArgumentNullException(nameof(target));
        if (declared.Kind != CanopyColumnKind.Text) throw new ArgumentException("A link field is a text field.", nameof(id));
        if (!RecordKeys.Supported(typeof(TKey))) throw new ArgumentException("A related record's key is text, a GUID or an integer.", nameof(target));
        if (view != null) _ = new CanopyRecordRef("x", view);
        _fields.Add(new LinkMap<T>(id, target, text, view));
        return this;
    }

    /// <summary>Maps a column's fuller drawer value (<c>cells</c>), for example a whole list whose grid cell shows a count.</summary>
    /// <typeparam name="TValue">The value type; it must fit the column's kind.</typeparam>
    /// <param name="column">The declared view column.</param>
    /// <param name="value">The value expression.</param>
    /// <param name="format">Creates the cell from the raw value; null converts it as column values are.</param>
    /// <returns>This map.</returns>
    public CanopyRecordMap<T> Cell<TValue>(string column, Expression<Func<T, TValue>> value, Func<TValue, CanopyCell?>? format = null) {
        Mutable();
        if (value == null) throw new ArgumentNullException(nameof(value));
        var declared = Columns.View.Columns.FirstOrDefault(item => item.Id == column) ?? throw new ArgumentException("Column '" + column + "' is not declared by view '" + Columns.View.Id + "'.", nameof(column));
        if (_cells.Any(cell => cell.Id == column)) throw new ArgumentException("Column '" + column + "' already has a drawer value.", nameof(column));
        if (!ValueShapes.Fits(ValueShapes.Of(typeof(TValue), column), declared.Kind)) throw new ArgumentException("Column '" + column + "' is a " + declared.Kind + " column and cannot map " + typeof(TValue).Name + ".", nameof(value));
        _cells.Add(new ScalarMap<T>(column, value, Format(format)));
        return this;
    }

    /// <summary>Maps a record panel field to a collection of child rows with their own columns, shown as a nested grid that pages.</summary>
    /// <typeparam name="TChild">The child row type.</typeparam>
    /// <param name="id">The record panel field identity.</param>
    /// <param name="items">The navigation from the record to its child rows, for example <c>m =&gt; m.Software</c>.</param>
    /// <param name="configure">Maps the child key, columns, order and page size.</param>
    /// <returns>This map.</returns>
    public CanopyRecordMap<T> Collection<TChild>(string id, Expression<Func<T, IEnumerable<TChild>>> items, Action<CanopyRecordListMap<TChild>> configure) {
        Declared(id);
        var map = new CanopyRecordListMap<TChild>();
        (configure ?? throw new ArgumentNullException(nameof(configure)))(map);
        _fields.Add(new ChildSetMap<T, TChild>(id, items ?? throw new ArgumentNullException(nameof(items)), map.Build(id)));
        return this;
    }

    /// <summary>Maps a record panel field to a timeline of child rows: events with a time, summary, actor and kind.</summary>
    /// <typeparam name="TChild">The event row type.</typeparam>
    /// <param name="id">The record panel field identity.</param>
    /// <param name="items">The navigation from the record to its event rows.</param>
    /// <param name="configure">Maps the event key, time, summary, actor, kind and limit.</param>
    /// <returns>This map.</returns>
    public CanopyRecordMap<T> Timeline<TChild>(string id, Expression<Func<T, IEnumerable<TChild>>> items, Action<CanopyRecordTimelineMap<TChild>> configure) {
        Declared(id);
        var map = new CanopyRecordTimelineMap<TChild>();
        (configure ?? throw new ArgumentNullException(nameof(configure)))(map);
        _fields.Add(new ChildSetMap<T, TChild>(id, items ?? throw new ArgumentNullException(nameof(items)), map.Build(id)));
        return this;
    }

    /// <summary>Maps a record panel field to a before/after list of child rows: changed field names with their old and new values.</summary>
    /// <typeparam name="TChild">The change row type.</typeparam>
    /// <param name="id">The record panel field identity.</param>
    /// <param name="items">The navigation from the record to its change rows.</param>
    /// <param name="configure">Maps the change key, name, values, order and limit.</param>
    /// <returns>This map.</returns>
    public CanopyRecordMap<T> Changes<TChild>(string id, Expression<Func<T, IEnumerable<TChild>>> items, Action<CanopyRecordChangesMap<TChild>> configure) {
        Declared(id);
        var map = new CanopyRecordChangesMap<TChild>();
        (configure ?? throw new ArgumentNullException(nameof(configure)))(map);
        _fields.Add(new ChildSetMap<T, TChild>(id, items ?? throw new ArgumentNullException(nameof(items)), map.Build(id)));
        return this;
    }

    private CanopyColumn Declared(string id) {
        Mutable();
        if (id == null || !_declared.TryGetValue(id, out var declared)) throw new ArgumentException("Field '" + id + "' is not a record field of view '" + Columns.View.Id + "'.", nameof(id));
        if (_fields.Any(field => field.Id == id)) throw new ArgumentException("Field '" + id + "' is already mapped.", nameof(id));
        return declared;
    }

    private static Func<object?, CanopyCell?>? Format<TValue>(Func<TValue, CanopyCell?>? format) =>
        format == null ? null : raw => format(raw is TValue typed ? typed : default!);

    private void Mutable() {
        if (_schema != null) throw new InvalidOperationException("The record map is frozen once its schema is in use.");
    }
}
