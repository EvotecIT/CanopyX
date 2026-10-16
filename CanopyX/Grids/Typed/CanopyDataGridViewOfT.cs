using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX;

/// <summary>
/// A flat grid authored from a typed record: columns come from member expressions (<c>grid.Column(x =&gt; x.Owner)</c>), so a
/// renamed or removed member fails the build, and rows are written from <see cref="IEnumerable{T}"/>. Unlike
/// <see cref="CanopyGridMapper{T}"/>, which takes a column and a selector per column, it derives each column from its member.
/// </summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>A column's id is its member path in camel case (<c>x =&gt; x.Team.Name</c> is <c>teamName</c>), its title the member path
/// as words, and its kind follows the member type: numbers are <see cref="CanopyColumnKind.Number"/>, <see cref="DateTime"/>,
/// <see cref="DateTimeOffset"/> (and <c>DateOnly</c> on .NET 6 or later, as UTC midnight) are <see cref="CanopyColumnKind.DateTime"/>,
/// everything else is text (booleans stay booleans, enumerations their names). Each of these can be given instead. Values
/// are read through the compiled member expression (interpreted under native AOT). Explicit conversions run as written,
/// including checked overflow; a converted value's type determines its kind, while boxing retains the underlying kind.</para>
/// <para><see cref="View"/> is the untyped <see cref="CanopyDataGridView"/> underneath; every other setting (reporting, the record
/// panel, live data, formatting) is set there, and the untyped API keeps working on it.</para>
/// </remarks>
public sealed partial class CanopyDataGridView<T> {
    private readonly Func<T, string> _identity;
    private readonly List<KeyValuePair<CanopyColumn, Func<T, CanopyCell?>>> _cells = new List<KeyValuePair<CanopyColumn, Func<T, CanopyCell?>>>();
    private readonly List<KeyValuePair<string, Func<T, CanopyCell?>>> _fields = new List<KeyValuePair<string, Func<T, CanopyCell?>>>();

    /// <summary>Creates a typed grid.</summary>
    /// <param name="id">The grid's identity.</param>
    /// <param name="label">The grid's visible label.</param>
    /// <param name="identity">Returns each record's stable identity, unique in the dataset.</param>
    /// <exception cref="ArgumentNullException"><paramref name="identity"/> is null.</exception>
    public CanopyDataGridView(string id, string label, Func<T, string> identity) {
        _identity = identity ?? throw new ArgumentNullException(nameof(identity));
        View = new CanopyDataGridView(id, label);
    }

    /// <summary>Gets the untyped grid definition the typed members write to.</summary>
    public CanopyDataGridView View { get; }

    /// <summary>Adds a column for a member of the record and returns it, for further settings.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member, as <c>x =&gt; x.Owner</c> or a chain such as <c>x =&gt; x.Team.Name</c>; a null link of a chain leaves the cell empty.</param>
    /// <param name="title">The column's title; by default the member path as words.</param>
    /// <param name="configure">Sets the column's options (sorting, presenter, sizing, …).</param>
    /// <param name="cell">Writes a value's cell (display text, tone, badges); by default the raw value.</param>
    /// <returns>The column added to <see cref="View"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain, or the column id is taken.</exception>
    public CanopyColumn Column<TValue>(Expression<Func<T, TValue>> member, string? title = null, Action<CanopyColumn>? configure = null, Func<TValue, CanopyCell?>? cell = null) {
        var path = CanopyTypedMembers.Path(member);
        return AddColumn(CanopyTypedMembers.Id(path), member, path, configure, cell, title ?? CanopyTypedMembers.Title(path));
    }

    /// <summary>Adds a column with an explicit id for a member of the record and returns it.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="id">The column's id.</param>
    /// <param name="member">The member or any expression of the record; only a member chain reads null links as empty cells.</param>
    /// <param name="title">The column's title; by default the member path (or the id) as words.</param>
    /// <param name="configure">Sets the column's options.</param>
    /// <param name="cell">Writes a value's cell; by default the raw value.</param>
    /// <returns>The column added to <see cref="View"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The column id is taken.</exception>
    public CanopyColumn Column<TValue>(string id, Expression<Func<T, TValue>> member, string? title = null, Action<CanopyColumn>? configure = null, Func<TValue, CanopyCell?>? cell = null) {
        if (member == null) throw new ArgumentNullException(nameof(member));
        var path = CanopyTypedMembers.TryPath(member);
        return AddColumn(id, member, path, configure, cell, title ?? (path != null ? CanopyTypedMembers.Title(path) : CanopyTypedMembers.Title(id)));
    }

    private CanopyColumn AddColumn<TValue>(string id, Expression<Func<T, TValue>> member, IReadOnlyList<MemberInfo>? path, Action<CanopyColumn>? configure, Func<TValue, CanopyCell?>? cell, string title) {
        foreach (var existing in View.Columns) if (existing.Id == id) throw new ArgumentException("The grid already has a column '" + id + "'.", nameof(id));
        if (View.Record != null) foreach (var field in View.Record.Fields) if (field.Id == id) throw new ArgumentException("The record panel already has a field '" + id + "'.", nameof(id));
        var column = new CanopyColumn(id, title) { Kind = CanopyTypedMembers.Kind(CanopyTypedMembers.ValueType(member)) };
        configure?.Invoke(column);
        _cells.Add(new KeyValuePair<CanopyColumn, Func<T, CanopyCell?>>(column, Writer(member, path, cell)));
        View.Columns.Add(column);
        return column;
    }

    /// <summary>Adds a record panel field (a drawer-only value, not a grid column) for a member and returns it.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member; a null link of a chain leaves the value empty.</param>
    /// <param name="title">The field's title; by default the member path as words.</param>
    /// <param name="configure">Sets the field's options (presenter, section, …).</param>
    /// <param name="cell">Writes a value's cell; by default the raw value.</param>
    /// <returns>The field added to the record panel, which is created when the view has none.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain, or the id is taken by a column or field.</exception>
    public CanopyColumn Field<TValue>(Expression<Func<T, TValue>> member, string? title = null, Action<CanopyColumn>? configure = null, Func<TValue, CanopyCell?>? cell = null) {
        var path = CanopyTypedMembers.Path(member);
        return AddField(CanopyTypedMembers.Id(path), member, path, configure, cell, title ?? CanopyTypedMembers.Title(path));
    }

    /// <summary>Adds a record panel field with an explicit id (for example where two member paths share an id) and returns it.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="id">The field's id.</param>
    /// <param name="member">The member or any expression of the record.</param>
    /// <param name="title">The field's title; by default the member path (or the id) as words.</param>
    /// <param name="configure">Sets the field's options.</param>
    /// <param name="cell">Writes a value's cell; by default the raw value.</param>
    /// <returns>The field added to the record panel.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The id is taken by a column or field.</exception>
    public CanopyColumn Field<TValue>(string id, Expression<Func<T, TValue>> member, string? title = null, Action<CanopyColumn>? configure = null, Func<TValue, CanopyCell?>? cell = null) {
        if (member == null) throw new ArgumentNullException(nameof(member));
        var path = CanopyTypedMembers.TryPath(member);
        return AddField(id, member, path, configure, cell, title ?? (path != null ? CanopyTypedMembers.Title(path) : CanopyTypedMembers.Title(id)));
    }

    private CanopyColumn AddField<TValue>(string id, Expression<Func<T, TValue>> member, IReadOnlyList<MemberInfo>? path, Action<CanopyColumn>? configure, Func<TValue, CanopyCell?>? cell, string title) {
        foreach (var existing in View.Columns) if (existing.Id == id) throw new ArgumentException("The grid already has a column '" + id + "'.", nameof(id));
        var record = View.Record ??= new CanopyRecordPanel();
        foreach (var existing in record.Fields) if (existing.Id == id) throw new ArgumentException("The record panel already has a field '" + id + "'.", nameof(id));
        var field = new CanopyColumn(id, title) { Kind = CanopyTypedMembers.Kind(CanopyTypedMembers.ValueType(member)) };
        configure?.Invoke(field);
        _fields.Add(new KeyValuePair<string, Func<T, CanopyCell?>>(field.Id, Writer(member, path, cell)));
        record.Fields.Add(field);
        return field;
    }

    // A member chain reads null links as nothing (an empty cell); any other expression runs as written.
    private static Func<T, CanopyCell?> Writer<TValue>(Expression<Func<T, TValue>> member, IReadOnlyList<MemberInfo>? path, Func<TValue, CanopyCell?>? cell) {
        var read = path != null ? CanopyTypedMembers.Reader(member) : Plain(member);
        return record => {
            var value = read(record);
            if (ReferenceEquals(value, CanopyTypedMembers.Missing) || value == null && default(TValue) != null) return null;
            return cell != null ? cell((TValue)value!) : CanopyTypedMembers.Cell(value);
        };
    }

    private static Func<T, object?> Plain<TValue>(Expression<Func<T, TValue>> member) {
        var compiled = member.Compile();
        return record => compiled(record);
    }
    /// <summary>Gets the id of the column a member writes, for settings that name columns (search columns, facet columns, sorts).</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member.</param>
    /// <returns>The column id.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public string ColumnId<TValue>(Expression<Func<T, TValue>> member) => CanopyTypedMembers.Id(CanopyTypedMembers.Path(member));

    /// <summary>Writes one record as a row: the identity, every column's cell and every record field's value; a null value leaves its cell empty.</summary>
    /// <param name="record">The record.</param>
    /// <returns>The row.</returns>
    public CanopyGridRow Row(T record) {
        var row = new CanopyGridRow(_identity(record));
        foreach (var entry in _cells) { var value = entry.Value(record); if (value != null) row.Cells[entry.Key.Id] = value; }
        foreach (var entry in _fields) { var value = entry.Value(record); if (value != null) row.Fields[entry.Key] = value; }
        return row;
    }

    /// <summary>Adds the records as the grid's inline rows and returns the grid, for chaining.</summary>
    /// <param name="records">The records, in any order.</param>
    /// <returns>This grid.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="records"/> is null.</exception>
    public CanopyDataGridView<T> AddRows(IEnumerable<T> records) {
        if (records == null) throw new ArgumentNullException(nameof(records));
        foreach (var record in records) View.Rows.Add(Row(record));
        return this;
    }

    /// <summary>Writes the HTML-safe <c>grid</c> document of <see cref="View"/>.</summary>
    /// <returns>The document.</returns>
    public string ToJson() => View.ToJson();

    /// <summary>Gets the untyped view, so a typed grid goes wherever a <see cref="CanopyDataGridView"/> does.</summary>
    /// <param name="grid">The typed grid.</param>
    public static implicit operator CanopyDataGridView(CanopyDataGridView<T> grid) => grid?.View!;
}
