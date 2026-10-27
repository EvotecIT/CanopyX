using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>A schema-bound exact tuple membership predicate with explicit null semantics.</summary>
public sealed class CanopyTupleFilter {
    private readonly HashSet<string> _keys;
    /// <summary>Binds a bounded tuple predicate to one endpoint's column allow-list.</summary>
    /// <param name="schema">The endpoint schema.</param>
    /// <param name="definition">The generic tuple predicate.</param>
    public CanopyTupleFilter(CanopyDataSchema schema, CanopyGridTupleFilter definition) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        Definition = definition ?? throw new ArgumentNullException(nameof(definition));
        definition.Validate(id => schema.GetColumn(id).Definition);
        Columns = Array.AsReadOnly(definition.Columns.Select(field => schema.GetColumn(field.Column)).ToArray());
        var values = definition.Values.Select(tuple => (IReadOnlyList<object?>)Array.AsReadOnly(tuple.Select((cell, index) => Normalize(cell?.Value, index)).ToArray())).ToArray();
        Values = Array.AsReadOnly(values);
        _keys = new HashSet<string>(values.Select(Key), StringComparer.Ordinal);
    }
    /// <summary>Gets the owning allow-list.</summary>
    public CanopyDataSchema Schema { get; }
    /// <summary>Gets the generic predicate, including its optional bucket fields and exclusion flag.</summary>
    public CanopyGridTupleFilter Definition { get; }
    /// <summary>Gets the allowed fields in operand order.</summary>
    public IReadOnlyList<CanopyDataColumn> Columns { get; }
    /// <summary>Gets normalized operand tuples.</summary>
    public IReadOnlyList<IReadOnlyList<object?>> Values { get; }

    private object? Normalize(object? raw, int index) {
        var value = CanopyDataValues.Normalize(raw);
        return value != null && (Definition.Columns[index].Bucket != null || Columns[index].Kind == CanopyColumnKind.Number) ? CanopyNumericValues.ToDouble(value) : value;
    }
    internal bool Matches(Func<CanopyDataColumn, object?> read) {
        var values = new object?[Columns.Count];
        for (var i = 0; i < Columns.Count; i++) {
            var raw = read(Columns[i]); var bucket = Definition.Columns[i].Bucket;
            values[i] = bucket == null ? Normalize(raw, i) : bucket.Key(raw);
        }
        var matches = _keys.Contains(Key(values));
        return Definition.Exclude ? !matches : matches;
    }
    private static string Key(IEnumerable<object?> values) {
        var writer = new CanopyJsonWriter(); writer.BeginArray();
        foreach (var value in values) writer.String(CanopyRemoteHandler.GroupKey(value is double number && number == 0 ? 0d : value));
        return writer.EndArray().ToString();
    }
}
