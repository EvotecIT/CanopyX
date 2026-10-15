using System;

namespace CanopyX;

/// <summary>Wire names of the formatting enums, shared by the writer, the validator and the static evaluator.</summary>
internal static class CanopyFormatNames {
    private static readonly string[] Operators = { "eq", "ne", "gt", "ge", "lt", "le", "contains", "notContains", "startsWith", "endsWith", "like", "notLike",
        "matches", "notMatches", "in", "notIn", "between", "betweenExclusive", "isNull", "isNotNull", "olderThan", "withinLast" };

    internal static string Wire(CanopyFormatOperator op) =>
        (int)op >= 0 && (int)op < Operators.Length ? Operators[(int)op] : throw new ArgumentOutOfRangeException(nameof(op), op, "Unknown formatting operator.");

    internal static CanopyFormatOperator FromWire(string name) {
        var index = Array.IndexOf(Operators, name);
        return index >= 0 ? (CanopyFormatOperator)index : throw new ArgumentOutOfRangeException(nameof(name), name, "Unknown formatting operator.");
    }

    /// <summary>Operand count: -1 for one to 1,000 operands.</summary>
    internal static int Arity(CanopyFormatOperator op) => op switch {
        CanopyFormatOperator.IsNull or CanopyFormatOperator.IsNotNull => 0,
        CanopyFormatOperator.In or CanopyFormatOperator.NotIn => -1,
        CanopyFormatOperator.Between or CanopyFormatOperator.BetweenExclusive => 2,
        _ => (int)op >= 0 && (int)op < Operators.Length ? 1 : throw new ArgumentOutOfRangeException(nameof(op), op, "Unknown formatting operator.")
    };

    internal static string Wire(CanopyFormatValueType type) => type switch {
        CanopyFormatValueType.Text => "text",
        CanopyFormatValueType.Number => "number",
        CanopyFormatValueType.Boolean => "boolean",
        CanopyFormatValueType.Date => "date",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown formatting value type.")
    };

    internal static string Wire(CanopyFormatJunction junction) => junction switch {
        CanopyFormatJunction.All => "and",
        CanopyFormatJunction.Any => "or",
        CanopyFormatJunction.None => "none",
        _ => throw new ArgumentOutOfRangeException(nameof(junction), junction, "Unknown formatting junction.")
    };

    internal static string Wire(CanopyFormatTarget target) => target switch {
        CanopyFormatTarget.Cell => "cell",
        CanopyFormatTarget.Row => "row",
        CanopyFormatTarget.Columns => "columns",
        _ => throw new ArgumentOutOfRangeException(nameof(target), target, "Unknown formatting target.")
    };

    internal static string Wire(CanopyFormatEmphasis emphasis) => emphasis switch {
        CanopyFormatEmphasis.Fill => "fill",
        CanopyFormatEmphasis.Text => "text",
        CanopyFormatEmphasis.Strong => "strong",
        _ => throw new ArgumentOutOfRangeException(nameof(emphasis), emphasis, "Unknown formatting emphasis.")
    };

    internal static string Wire(CanopyFormatScaleStopType type) => type switch {
        CanopyFormatScaleStopType.Minimum => "min",
        CanopyFormatScaleStopType.Maximum => "max",
        CanopyFormatScaleStopType.Number => "number",
        CanopyFormatScaleStopType.Percent => "percent",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown colour scale stop.")
    };
}
