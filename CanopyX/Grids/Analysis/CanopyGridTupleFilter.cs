using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Bounded exact membership of one to six column values, preserving correlation and matching nulls explicitly.</summary>
/// <remarks>Used by pivot drill-through, including the complement of the visible column paths for Other.
/// Unlike separate column membership tests, tuples cannot admit combinations that did not occur in a clicked cell.</remarks>
public sealed class CanopyGridTupleFilter {
    /// <summary>Creates an exact tuple membership or exclusion predicate.</summary>
    /// <param name="columns">One to six ordered column fields.</param>
    /// <param name="values">One to 200 equally wide operand tuples; null is an explicit missing value.</param>
    /// <param name="exclude">True to keep records outside the listed tuples.</param>
    public CanopyGridTupleFilter(IEnumerable<CanopyGridTupleColumn> columns, IEnumerable<IEnumerable<CanopyCell?>> values, bool exclude = false) {
        if (columns == null) throw new ArgumentNullException(nameof(columns));
        if (values == null) throw new ArgumentNullException(nameof(values));
        var fields = columns.Take(7).ToArray();
        if (fields.Length < 1 || fields.Length > 6 || fields.Any(field => field == null)) throw new ArgumentException("A tuple has one to six fields.", nameof(columns));
        var tuples = new List<IReadOnlyList<CanopyCell?>>();
        foreach (var row in values) {
            if (tuples.Count == 200 || row == null) throw new ArgumentException("A tuple filter has one to 200 operand tuples.", nameof(values));
            var cells = row.Take(7).ToArray();
            if (cells.Length != fields.Length) throw new ArgumentException("Tuple widths must match their fields.", nameof(values));
            tuples.Add(Array.AsReadOnly(cells));
        }
        if (tuples.Count == 0) throw new ArgumentException("A tuple filter needs at least one operand tuple.", nameof(values));
        Columns = Array.AsReadOnly(fields); Values = new ReadOnlyCollection<IReadOnlyList<CanopyCell?>>(tuples); Exclude = exclude;
    }
    /// <summary>Gets the ordered fields.</summary>
    public IReadOnlyList<CanopyGridTupleColumn> Columns { get; }
    /// <summary>Gets the exact operand tuples.</summary>
    public IReadOnlyList<IReadOnlyList<CanopyCell?>> Values { get; }
    /// <summary>Gets whether membership is excluded.</summary>
    public bool Exclude { get; }

    internal void Validate(Func<string, CanopyColumn> resolve) {
        for (var index = 0; index < Columns.Count; index++) {
            var field = Columns[index]; var column = resolve(field.Column);
            if (!column.Filterable) throw new InvalidOperationException("Tuple predicates require filterable columns.");
            field.Bucket?.Validate(column);
            if (field.Bucket != null) column = new CanopyColumn(column.Id, column.Title) { Kind = CanopyColumnKind.Number };
            foreach (var tuple in Values) CanopyGridValues.Validate(CanopyGridValues.Normalize(tuple[index]?.Value), column);
        }
    }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("columns").BeginArray(); foreach (var field in Columns) field.WriteJson(writer);
        writer.EndArray().Name("values").BeginArray();
        foreach (var tuple in Values) {
            writer.BeginArray(); foreach (var cell in tuple) { if (cell == null) writer.Null(); else cell.WriteValue(writer); } writer.EndArray();
        }
        writer.EndArray().Property("exclude", Exclude).EndObject();
    }
}
