using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
#if NET5_0_OR_GREATER
using System.Diagnostics.CodeAnalysis;
#endif

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>
    /// Builds a grid from records in one call: a column for every public property of <typeparamref name="T"/> (or every key,
    /// when the records are dictionaries such as <c>Dictionary&lt;string, object?&gt;</c> or a PowerShell hashtable), and the records as its rows.
    /// </summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="records">The records, read once.</param>
    /// <param name="key">
    /// The property, dictionary key or column id whose value identifies each record. Without one, the property marked
    /// <see cref="CanopyKeyAttribute"/> is the key, and without that the records are numbered in order
    /// (<see cref="CanopyGridRowIdentity.Ordinal"/>).
    /// </param>
    /// <param name="id">The grid's identity; by default the record type's name in camel case, or <c>records</c>.</param>
    /// <param name="label">The grid's label; by default the record type's name as words, or <c>Records</c>.</param>
    /// <returns>The typed grid, with its columns and rows written; settings go on <see cref="CanopyDataGridView{T}.View"/>.</returns>
    /// <remarks>
    /// Properties of text, number, boolean, date, time, enumeration and <see cref="Guid"/> types become columns, in declaration
    /// order, titled and typed as <see cref="CanopyDataGridView{T}.Column{TValue}(System.Linq.Expressions.Expression{Func{T, TValue}}, string, Action{CanopyColumn}, Func{TValue, CanopyCell})"/>
    /// would title and type them. <see cref="CanopyColumnAttribute"/> sets a column's title, order, visibility and display
    /// format, or includes a property of another type as text; <see cref="CanopyIgnoreAttribute"/> leaves a property out.
    /// Dictionary keys keep their names as column ids; a column's kind follows its values, and a key whose values mix kinds is text.
    /// </remarks>
    /// <exception cref="ArgumentNullException"><paramref name="records"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="key"/> names no value of the records.</exception>
    /// <exception cref="InvalidOperationException">More than one property is marked as the key, or a record has no key value.</exception>
    public static CanopyDataGridView<T> From<
#if NET5_0_OR_GREATER
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)]
#endif
        T>(IEnumerable<T> records, string? key = null, string? id = null, string? label = null) {
        var list = Materialize(records);
        var fields = CanopyAutoColumns.Discover(list);
        CanopyAutoColumns.Field<T>? keyField;
        if (key != null) keyField = CanopyAutoColumns.Find(fields, key);
        else {
            var marked = fields.Where(field => field.IsKey).ToList();
            if (marked.Count > 1) throw new InvalidOperationException(typeof(T).Name + " marks more than one property with [CanopyKey].");
            keyField = marked.FirstOrDefault();
        }

        return Build(list, fields, keyField != null ? CanopyAutoColumns.Identity(keyField) : null, id ?? DefaultId(typeof(T)), label ?? DefaultLabel(typeof(T)));
    }

    /// <summary>Builds a grid from records in one call, keyed by text the selector returns; columns as <see cref="From{T}(IEnumerable{T}, string, string, string)"/> derives them.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="records">The records, read once.</param>
    /// <param name="key">Returns each record's stable identity, unique in the dataset.</param>
    /// <param name="id">The grid's identity; by default the record type's name in camel case.</param>
    /// <param name="label">The grid's label; by default the record type's name as words.</param>
    /// <returns>The typed grid, with its columns and rows written.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="records"/> or <paramref name="key"/> is null.</exception>
    public static CanopyDataGridView<T> From<
#if NET5_0_OR_GREATER
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)]
#endif
        T>(IEnumerable<T> records, Func<T, string> key, string? id = null, string? label = null) {
        if (key == null) throw new ArgumentNullException(nameof(key));
        var list = Materialize(records);
        return Build(list, CanopyAutoColumns.Discover(list), key, id ?? DefaultId(typeof(T)), label ?? DefaultLabel(typeof(T)));
    }

    /// <summary>Builds a grid from records in one call, keyed by a number written as invariant digits; columns as <see cref="From{T}(IEnumerable{T}, string, string, string)"/> derives them.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="records">The records, read once.</param>
    /// <param name="key">Returns each record's stable numeric key, unique in the dataset.</param>
    /// <param name="id">The grid's identity; by default the record type's name in camel case.</param>
    /// <param name="label">The grid's label; by default the record type's name as words.</param>
    /// <returns>The typed grid, with its columns and rows written.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="records"/> or <paramref name="key"/> is null.</exception>
    public static CanopyDataGridView<T> From<
#if NET5_0_OR_GREATER
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)]
#endif
        T>(IEnumerable<T> records, Func<T, long> key, string? id = null, string? label = null) {
        if (key == null) throw new ArgumentNullException(nameof(key));
        return From(records, record => CanopyRowIdentity.Format(key(record)), id, label);
    }

    /// <summary>
    /// Builds a grid from a <see cref="DataTable"/> in one call: a column per data column (titled by its caption, or its name as
    /// words, and typed by its data type) and a row per data row that is not deleted.
    /// </summary>
    /// <param name="table">The table.</param>
    /// <param name="key">The data column whose value identifies each row; by default the table's single-column primary key, and without one the rows are numbered in order.</param>
    /// <param name="id">The grid's identity; by default the table name, or <c>records</c>.</param>
    /// <param name="label">The grid's label; by default the table name, or <c>Records</c>.</param>
    /// <returns>The grid over the table's rows; settings go on <see cref="CanopyDataGridView{T}.View"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="table"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="key"/> names no column of the table.</exception>
    /// <exception cref="InvalidOperationException">A row has no key value.</exception>
    public static CanopyDataGridView<DataRow> From(DataTable table, string? key = null, string? id = null, string? label = null) {
        if (table == null) throw new ArgumentNullException(nameof(table));
        var fields = CanopyAutoColumns.FromTable(table);
        var keyField = key != null ? CanopyAutoColumns.Find(fields, key) : fields.FirstOrDefault(field => field.IsKey);
        var rows = table.Rows.Cast<DataRow>().Where(row => row.RowState != DataRowState.Deleted).ToList();
        var name = string.IsNullOrEmpty(table.TableName) ? null : table.TableName;
        return Build(rows, fields, keyField != null ? CanopyAutoColumns.Identity(keyField) : null, id ?? name ?? "records", label ?? name ?? "Records");
    }

    private static List<T> Materialize<T>(IEnumerable<T> records) => (records ?? throw new ArgumentNullException(nameof(records))).ToList();

    private static CanopyDataGridView<T> Build<T>(List<T> records, List<CanopyAutoColumns.Field<T>> fields, Func<T, string>? identity, string id, string label) {
        var grid = identity != null ? new CanopyDataGridView<T>(id, label, identity) : new CanopyDataGridView<T>(id, label, CanopyGridRowIdentity.Ordinal);
        foreach (var field in fields.Where(field => field.Shown).OrderBy(field => field.Order)) grid.AddColumn(field.Column, CanopyAutoColumns.Writer(field));
        return grid.AddRows(records);
    }

    private static bool IsPlainName(Type type) => type.Name.Length > 0 && type.Name.All(character => char.IsLetterOrDigit(character) || character == '_') && !typeof(System.Collections.IEnumerable).IsAssignableFrom(type) && type != typeof(object);

    private static string DefaultId(Type type) => IsPlainName(type) ? CanopyTypedMembers.Id(new System.Reflection.MemberInfo[] { type }) : "records";

    private static string DefaultLabel(Type type) => IsPlainName(type) ? CanopyTypedMembers.Title(type.Name) : "Records";
}
