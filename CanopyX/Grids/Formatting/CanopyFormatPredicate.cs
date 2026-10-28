using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One test of a formatting condition: a column, an operator and typed operands, or another column to compare with.
/// The same predicate as a flat-grid filter, with more operators, value types, case sensitivity and a culture.
/// </summary>
/// <remarks>
/// Text compares case-insensitively by default, with the runtime's search folding; with a <see cref="Culture"/> it
/// lowercases and orders with that culture's rules. Missing values match only <see cref="CanopyFormatOperator.IsNull"/>.
/// </remarks>
public sealed class CanopyFormatPredicate {
    private string? _culture;

    /// <summary>Creates a predicate.</summary>
    /// <param name="column">The declared column it reads.</param>
    /// <param name="op">The operator.</param>
    /// <param name="values">
    /// Raw operands: none for the null tests, two for the ranges, 1 to 1,000 for <c>In</c> and <c>NotIn</c>, a number of days
    /// for the relative dates, and one otherwise.
    /// </param>
    /// <exception cref="ArgumentException">The column is empty, or the operands do not fit the operator.</exception>
    public CanopyFormatPredicate(string column, CanopyFormatOperator op, params CanopyCell[] values) {
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column;
        Operator = op;
        Values = Array.AsReadOnly((CanopyCell[])(values ?? throw new ArgumentNullException(nameof(values))).Clone());
        ValidateArity();
    }

    /// <summary>Gets the column the predicate reads.</summary>
    public string Column { get; }

    /// <summary>Gets the operator.</summary>
    public CanopyFormatOperator Operator { get; }

    /// <summary>Gets the raw operands.</summary>
    public IReadOnlyList<CanopyCell> Values { get; }

    /// <summary>Gets or sets another declared column whose value is the operand, for one-operand comparisons without values.</summary>
    public string? ValueColumn { get; set; }

    /// <summary>Gets or sets how values are read before they are compared. Defaults to the column's kind.</summary>
    public CanopyFormatValueType ValueType { get; set; }

    /// <summary>Gets or sets whether text compares case-sensitively. Defaults to false.</summary>
    public bool CaseSensitive { get; set; }

    /// <summary>Gets or sets a BCP 47 culture (for example <c>pl-PL</c>) for parsing numbers in text and comparing text, or null.</summary>
    /// <exception cref="ArgumentException">The value is not a culture name of at most 64 characters.</exception>
    public string? Culture {
        get => _culture;
        set {
            if (value != null && (value.Length == 0 || value.Length > 64)) throw new ArgumentException("A culture is a BCP 47 name of 1 to 64 characters.", nameof(value));
            _culture = value;
        }
    }

    /// <summary>Returns a predicate that compares a column with another column's value.</summary>
    /// <param name="column">The column read.</param>
    /// <param name="op">A one-operand operator, such as <see cref="CanopyFormatOperator.GreaterThan"/>.</param>
    /// <param name="valueColumn">The column whose value is the operand.</param>
    /// <returns>The predicate.</returns>
    public static CanopyFormatPredicate CompareColumns(string column, CanopyFormatOperator op, string valueColumn) {
        CanopyIdentifiers.Require(valueColumn, nameof(valueColumn));
        var predicate = new CanopyFormatPredicate(column, op, Array.Empty<CanopyCell>(), allowColumn: true) { ValueColumn = valueColumn };
        return predicate;
    }

    /// <summary>Returns the predicate of a flat-grid filter, so a filter can serve as a formatting condition.</summary>
    /// <param name="filter">The filter.</param>
    /// <returns>A predicate with the same column, operator and operands.</returns>
    public static CanopyFormatPredicate FromFilter(CanopyGridFilter filter) {
        if (filter == null) throw new ArgumentNullException(nameof(filter));
        if (filter.Bucket != null) throw new InvalidOperationException("A bucket filter cannot be used as a raw-value formatting condition.");
        var values = new CanopyCell[filter.Values.Count];
        for (var i = 0; i < values.Length; i++) values[i] = filter.Values[i];
        return new CanopyFormatPredicate(filter.Column, CanopyFormatNames.FromWire(filter.WireOperator), values);
    }

    private CanopyFormatPredicate(string column, CanopyFormatOperator op, CanopyCell[] values, bool allowColumn) {
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column; Operator = op; Values = Array.AsReadOnly(values);
        if (!allowColumn || CanopyFormatNames.Arity(op) != 1 || op == CanopyFormatOperator.OlderThanDays || op == CanopyFormatOperator.WithinLastDays ||
            op == CanopyFormatOperator.Like || op == CanopyFormatOperator.NotLike || op == CanopyFormatOperator.Matches || op == CanopyFormatOperator.NotMatches)
            throw new ArgumentException("Only one-operand comparisons read another column; patterns and relative dates take values.", nameof(op));
    }

    private void ValidateArity() {
        var arity = CanopyFormatNames.Arity(Operator);
        if (arity < 0 ? Values.Count < 1 || Values.Count > 1000 : Values.Count != arity)
            throw new ArgumentException("Null tests take no operands, ranges take two, In and NotIn take 1 to 1,000, and other operators take one.", nameof(Values));
        foreach (var operand in Values) {
            if (operand == null || operand.Value == null) throw new ArgumentException("Use a null test instead of a null operand.", nameof(Values));
        }
    }

    internal void Validate(IDictionary<string, CanopyColumn> columns) {
        if (!columns.TryGetValue(Column, out var column)) throw new InvalidOperationException("A formatting condition reads the undeclared column '" + Column + "'.");
        if (!Enum.IsDefined(typeof(CanopyFormatValueType), ValueType)) throw new ArgumentOutOfRangeException(nameof(ValueType));
        if (ValueColumn != null) {
            if (!columns.ContainsKey(ValueColumn)) throw new InvalidOperationException("A formatting condition compares with the undeclared column '" + ValueColumn + "'.");
            if (Values.Count != 0 || CanopyFormatNames.Arity(Operator) != 1 || Operator >= CanopyFormatOperator.Like && Operator <= CanopyFormatOperator.NotMatches ||
                Operator == CanopyFormatOperator.OlderThanDays || Operator == CanopyFormatOperator.WithinLastDays)
                throw new InvalidOperationException("A condition compares with values or, for one-operand comparisons, with a column.");
        } else ValidateArity();
        if (Culture != null) CanopyFormatValues.Culture(Culture);
        var relative = Operator == CanopyFormatOperator.OlderThanDays || Operator == CanopyFormatOperator.WithinLastDays;
        if (relative) {
            var days = Values.Count == 1 ? CanopyFormatValues.Coerce(Values[0].Value, CanopyFormatValueType.Number, null) as double? : null;
            if (days == null || days < 0 || days > 36500) throw new InvalidOperationException("Relative dates take a number of days from 0 to 36,500.");
            return;
        }
        if (Operator == CanopyFormatOperator.Like || Operator == CanopyFormatOperator.NotLike || Operator == CanopyFormatOperator.Matches || Operator == CanopyFormatOperator.NotMatches) {
            if (Values.Count == 1) CanopyFormatValues.Pattern(Operator, Values[0].Value as string ?? Convert.ToString(Values[0].Value, CultureInfo.InvariantCulture)!, CaseSensitive);
            return;
        }
        var type = CanopyFormatValues.TypeOf(this, column);
        foreach (var operand in Values) {
            if (operand.Value is string text && text.Length > 4096) throw new InvalidOperationException("Condition operands have at most 4,096 characters.");
            if (CanopyFormatValues.Coerce(operand.Value, type, Culture) == null) throw new InvalidOperationException("Operand '" + operand.Value + "' does not convert to the condition's value type.");
        }
        if ((Operator == CanopyFormatOperator.Between || Operator == CanopyFormatOperator.BetweenExclusive) && Values.Count == 2 &&
            CanopyFormatValues.Compare(CanopyFormatValues.Read(Values[0].Value, this, column), CanopyFormatValues.Read(Values[1].Value, this, column), this) > 0)
            throw new InvalidOperationException("A range starts with its lower value.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("column", Column).Property("operator", CanopyFormatNames.Wire(Operator));
        if (ValueColumn != null) writer.Property("valueColumn", ValueColumn);
        else {
            writer.Name("values").BeginArray();
            foreach (var operand in Values) operand.WriteValue(writer);
            writer.EndArray();
        }
        if (ValueType != CanopyFormatValueType.Auto) writer.Property("type", CanopyFormatNames.Wire(ValueType));
        if (CaseSensitive) writer.Property("caseSensitive", true);
        writer.OptionalProperty("culture", Culture).EndObject();
    }
}
