using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>The protocol's exact predicate, search and ordering rules over normalized raw values, shared with the browser runtime.</summary>
internal static class ProtocolSemantics {
    /// <summary>Evaluates one predicate the way the browser's inline grid does.</summary>
    internal static bool Matches(object? raw, CanopyColumnKind kind, CanopyGridFilterOperator op, IReadOnlyList<object> operands) {
        var scalar = Scalar(raw, kind);
        if (op == CanopyGridFilterOperator.IsNull) return scalar == null;
        if (op == CanopyGridFilterOperator.IsNotNull) return scalar != null;
        if (scalar == null) return false;
        var value = Fold(scalar);
        switch (op) {
            case CanopyGridFilterOperator.Equal: return Same(value, Fold(Scalar(operands[0], kind)!));
            case CanopyGridFilterOperator.NotEqual: return !Same(value, Fold(Scalar(operands[0], kind)!));
            case CanopyGridFilterOperator.In:
                foreach (var operand in operands) if (Same(value, Fold(Scalar(operand, kind)!))) return true;
                return false;
            case CanopyGridFilterOperator.Contains: return Text(value).IndexOf(Text(Fold(operands[0])), StringComparison.Ordinal) >= 0;
            case CanopyGridFilterOperator.StartsWith: return Text(value).StartsWith(Text(Fold(operands[0])), StringComparison.Ordinal);
            default:
                if (!(value is double left) || !(Scalar(operands[0], kind) is double right)) return false;
                return op switch {
                    CanopyGridFilterOperator.GreaterThan => left > right,
                    CanopyGridFilterOperator.GreaterThanOrEqual => left >= right,
                    CanopyGridFilterOperator.LessThan => left < right,
                    _ => left <= right
                };
        }
    }

    /// <summary>Whether a value contains a folded search term, reading its raw value as text.</summary>
    internal static bool ContainsTerm(object? raw, string foldedTerm) {
        var text = CanopyDataValues.ToSearchText(raw);
        return text != null && CanopyTextFolding.Fold(text)!.IndexOf(foldedTerm, StringComparison.Ordinal) >= 0;
    }

    /// <summary>Compares two raw values of one column: missing values last, numbers and dates by value, text ordinally or by the column policy.</summary>
    internal static int Compare(object? left, object? right, CanopyColumnKind kind, IComparer<string>? textOrder) {
        var a = Scalar(left, kind);
        var b = Scalar(right, kind);
        if (a == null || b == null) return a == b ? 0 : a == null ? 1 : -1;
        if (a is double x && b is double y) return x.CompareTo(y);
        if (a is double) return -1;
        if (b is double) return 1;
        return (textOrder ?? StringComparer.Ordinal).Compare(Text(a), Text(b));
    }

    /// <summary>The comparable scalar: numbers and dates (as epoch milliseconds) become doubles; text and booleans stay.</summary>
    internal static object? Scalar(object? raw, CanopyColumnKind kind) {
        var value = CanopyDataValues.Normalize(raw);
        switch (value) {
            case null: return null;
            case DateTime date: return (double)(date.Ticks / TimeSpan.TicksPerMillisecond);
            case string _: return value;
            case bool _: return value;
            default: return CanopyDataValues.ToDouble(value);
        }
    }

    private static object Fold(object value) => value is string text ? CanopyTextFolding.Fold(text)! : value;

    private static string Text(object value) => value is bool flag ? flag ? "true" : "false" : value is double number ? CanopyDataValues.FormatNumber(number) : (string)value;

    private static bool Same(object left, object right) => left.GetType() == right.GetType() && left.Equals(right);
}
