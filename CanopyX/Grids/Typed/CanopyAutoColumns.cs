using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
#if NET5_0_OR_GREATER
using System.Diagnostics.CodeAnalysis;
#endif

namespace CanopyX;

/// <summary>The columns <see cref="CanopyDataGridView.From{T}(IEnumerable{T}, string, string, string)"/> derives from records.</summary>
internal static class CanopyAutoColumns {
    /// <summary>One value of a record: where it is read from, its column, and whether it is the record's key.</summary>
    internal sealed class Field<T> {
        internal Field(string name, CanopyColumn column, Func<T, object?> read) {
            Name = name;
            Column = column;
            Read = read;
        }

        /// <summary>The name as the source writes it: the property name, the dictionary key or the data column name.</summary>
        internal string Name { get; }
        internal CanopyColumn Column { get; }
        internal Func<T, object?> Read { get; }
        internal int Order { get; set; }
        internal string? Format { get; set; }
        internal bool IsKey { get; set; }
        internal bool Shown { get; set; } = true;
    }

    /// <summary>The fields of records: their dictionary keys when they are dictionaries, otherwise the public properties of <typeparamref name="T"/>.</summary>
    internal static List<Field<T>> Discover<
#if NET5_0_OR_GREATER
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)]
#endif
        T>(IReadOnlyList<T> records) {
        var dictionaries = IsDictionary(typeof(T)) ||
            typeof(T) == typeof(object) && records.Count > 0 && records.All(record => record is IDictionary || record is IDictionary<string, object?>);
        return dictionaries ? FromDictionaries(records) : FromProperties<T>();
    }

    private static bool IsDictionary(Type type) => typeof(IDictionary).IsAssignableFrom(type) || typeof(IDictionary<string, object?>).IsAssignableFrom(type);

    private static List<Field<T>> FromProperties<
#if NET5_0_OR_GREATER
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)]
#endif
        T>() {
        var fields = new List<Field<T>>();
        foreach (var property in typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)) {
            if (property.GetGetMethod() == null || property.GetIndexParameters().Length != 0) continue;
            var key = property.IsDefined(typeof(CanopyKeyAttribute), true);
            var ignored = property.IsDefined(typeof(CanopyIgnoreAttribute), true);
            var settings = (CanopyColumnAttribute?)Attribute.GetCustomAttribute(property, typeof(CanopyColumnAttribute), true);
            if (!key && (ignored || settings == null && !IsSimple(property.PropertyType))) continue;
            var path = new MemberInfo[] { property };
            var column = new CanopyColumn(CanopyTypedMembers.Id(path), settings?.Title ?? CanopyTypedMembers.Title(path)) { Kind = CanopyTypedMembers.Kind(property.PropertyType) };
            if (settings?.Hidden == true) column.Hidden = true;
            fields.Add(new Field<T>(property.Name, column, Reader<T>(property)) { Order = settings?.Order ?? 0, Format = settings?.Format, IsKey = key, Shown = !ignored });
        }

        return fields;
    }

    private static Func<T, object?> Reader<T>(PropertyInfo property) {
        var record = Expression.Parameter(typeof(T), "record");
        return Expression.Lambda<Func<T, object?>>(Expression.Convert(Expression.Property(record, property), typeof(object)), record).Compile();
    }

    /// <summary>Text, numbers, booleans, dates, times, enumerations and GUIDs: the property types that become columns without an attribute.</summary>
    private static bool IsSimple(Type type) {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type.IsEnum || type == typeof(string) || type == typeof(DateTimeOffset) || type == typeof(TimeSpan) || type == typeof(Guid)) return true;
#if NET6_0_OR_GREATER
        if (type == typeof(DateOnly) || type == typeof(TimeOnly)) return true;
#endif
        var code = Type.GetTypeCode(type);
        return code != TypeCode.Object && code != TypeCode.Empty && code != TypeCode.DBNull;
    }

    /// <summary>A column per key, in the order keys first appear; the kind follows the values, and mixed kinds are text.</summary>
    private static List<Field<T>> FromDictionaries<T>(IReadOnlyList<T> records) {
        var keys = new List<KeyValuePair<string, object>>();
        var kinds = new Dictionary<string, CanopyColumnKind?>(StringComparer.Ordinal);
        foreach (var record in records) {
            foreach (var entry in Entries(record)) {
                var name = Convert.ToString(entry.Key, CultureInfo.InvariantCulture) ?? string.Empty;
                if (!kinds.TryGetValue(name, out var kind)) keys.Add(new KeyValuePair<string, object>(name, entry.Key));
                var value = entry.Value is DBNull ? null : entry.Value;
                if (value == null) { if (!kinds.ContainsKey(name)) kinds[name] = null; continue; }
                var valueKind = CanopyTypedMembers.Kind(value.GetType());
                kinds[name] = kind == null || kind == valueKind ? valueKind : CanopyColumnKind.Text;
            }
        }

        return keys.Select(key => new Field<T>(key.Key, new CanopyColumn(key.Key, TitleOf(key.Key)) { Kind = kinds[key.Key] ?? CanopyColumnKind.Text }, DictionaryReader<T>(key.Key, key.Value))).ToList();
    }

    private static IEnumerable<KeyValuePair<object, object?>> Entries(object? record) {
        if (record is IDictionary dictionary) {
            foreach (DictionaryEntry entry in dictionary) yield return new KeyValuePair<object, object?>(entry.Key, entry.Value);
        } else if (record is IDictionary<string, object?> typed) {
            foreach (var entry in typed) yield return new KeyValuePair<object, object?>(entry.Key, entry.Value);
        }
    }

    private static Func<T, object?> DictionaryReader<T>(string name, object key) => record => record switch {
        IDictionary dictionary => dictionary.Contains(key) ? dictionary[key] : null,
        IDictionary<string, object?> typed => typed.TryGetValue(name, out var value) ? value : null,
        _ => null
    };

    /// <summary>A column per data column: its caption when one is set, otherwise its name as words; its kind follows its data type.</summary>
    internal static List<Field<DataRow>> FromTable(DataTable table) {
        var fields = new List<Field<DataRow>>();
        foreach (DataColumn column in table.Columns) {
            var source = column;
            var title = string.IsNullOrEmpty(source.Caption) || source.Caption == source.ColumnName ? TitleOf(source.ColumnName) : source.Caption;
            var isKey = table.PrimaryKey.Length == 1 && table.PrimaryKey[0] == source;
            fields.Add(new Field<DataRow>(source.ColumnName, new CanopyColumn(source.ColumnName, title) { Kind = CanopyTypedMembers.Kind(source.DataType) }, row => row[source]) { IsKey = isKey });
        }

        return fields;
    }

    /// <summary>A source name as a title: an identifier as words (<c>LastSeen</c> is "Last seen"), any other name as written.</summary>
    private static string TitleOf(string name) {
        if (name.Length == 0) return name;
        foreach (var character in name) if (!char.IsLetterOrDigit(character) && character != '_') return name;
        var title = CanopyTypedMembers.Title(name);
        return title.Length == 0 ? name : title;
    }

    /// <summary>The field a key names: its source name or its column id, exactly, or else its source name ignoring case.</summary>
    internal static Field<T> Find<T>(List<Field<T>> fields, string key) =>
        fields.FirstOrDefault(field => field.Name == key || field.Column.Id == key) ??
        fields.FirstOrDefault(field => string.Equals(field.Name, key, StringComparison.OrdinalIgnoreCase)) ??
        throw new ArgumentException("The records have no value named '" + key + "' to use as their key.", nameof(key));

    /// <summary>The identity a key field writes: its value as invariant text.</summary>
    internal static Func<T, string> Identity<T>(Field<T> field) => record => {
        var value = field.Read(record);
        return value == null || value is DBNull
            ? throw new InvalidOperationException("A record has no value for its key '" + field.Name + "'.")
            : Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
    };

    /// <summary>Writes a field's cell: its raw value, with display text from the field's format when it has one.</summary>
    internal static Func<T, CanopyCell?> Writer<T>(Field<T> field) {
        var read = field.Read;
        var format = field.Format;
        return record => {
            var value = read(record);
            if (value is DBNull) return null;
            var cell = CanopyTypedMembers.Cell(value);
            if (cell != null && format != null && value is IFormattable formattable) cell.Text = formattable.ToString(format, CultureInfo.InvariantCulture);
            return cell;
        };
    }
}
