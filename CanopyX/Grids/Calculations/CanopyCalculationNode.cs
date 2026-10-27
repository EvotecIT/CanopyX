using System;
using System.Text;

namespace CanopyX;

/// <summary>An immutable AST node; evaluation state belongs only to the current call.</summary>
internal sealed class CanopyCalculationNode {
    private readonly string _operation;
    private readonly object? _value;
    private readonly CanopyCalculationNode[] _children;
    internal int Depth { get; }

    internal CanopyCalculationNode(string operation, object? value, CanopyCalculationNode[] children, int depth) {
        _operation = operation; _value = value; _children = children; Depth = depth;
    }

    internal CanopyCalculatedValue Evaluate(Func<string, object?> resolver) {
        if (_operation == "literal") return CanopyCalculationValues.Read(_value);
        if (_operation == "reference") return CanopyCalculationValues.Read(resolver((string)_value!));
        if (_operation == "IF") {
            var condition = _children[0].Evaluate(resolver);
            if (condition.IsError) return condition;
            if (condition.Value != null && !(condition.Value is bool)) return Error("type");
            return _children[condition.Value is bool flag && flag ? 1 : 2].Evaluate(resolver);
        }
        if (_operation == "COALESCE") {
            foreach (var child in _children) {
                var candidate = child.Evaluate(resolver);
                if (candidate.IsError || candidate.Value != null) return candidate;
            }
            return Result(null);
        }
        var values = new object?[_children.Length];
        for (var index = 0; index < values.Length; index++) {
            var result = _children[index].Evaluate(resolver);
            if (result.IsError) return result;
            values[index] = result.Value;
        }
        if (_operation == "CONCAT") {
            var text = new StringBuilder();
            foreach (var part in values) {
                var spelling = part == null ? string.Empty : part is double number ?
                    CanopyCalculationNumberText.Format(number) : part is bool boolean ? boolean ? "true" : "false" : (string)part;
                if (text.Length + spelling.Length > 4096) return Error("text-limit");
                text.Append(spelling);
            }
            return Result(text.ToString());
        }
        if (_operation == "=" || _operation == "==" || _operation == "!=" || _operation == "<>" ||
            _operation == "<" || _operation == "<=" || _operation == ">" || _operation == ">=") return Compare(values[0], values[1]);
        foreach (var value in values) if (value == null) return Result(null);
        if (_operation == "DATEPART" || _operation == "DATEDIFF") return CanopyCalculationDates.Evaluate(_operation, values);
        foreach (var value in values) if (!(value is double)) return Error("type");
        var left = (double)values[0]!;
        if (_operation == "u+") return Result(left);
        if (_operation == "u-") return Number(-left);
        var right = (double)values[1]!;
        switch (_operation) {
            case "+": return Number(left + right);
            case "-": return Number(left - right);
            case "*": return Number(left * right);
            case "/": return right == 0 ? Error("divide-by-zero") : Number(left / right);
            case "%": return right == 0 ? Error("divide-by-zero") : Number(left % right);
            case "ROUND":
                if (right < -12 || right > 12 || right != Math.Truncate(right)) return Error("type");
                var scale = double.Parse("1e" + right.ToString(System.Globalization.CultureInfo.InvariantCulture), System.Globalization.CultureInfo.InvariantCulture);
                var scaled = left * scale;
                if (double.IsInfinity(scaled)) return Error("number-range");
                // Avoid x + .5 changing an already-integral value at the binary64 precision boundary.
                var floor = Math.Floor(scaled);
                var rounded = scaled - floor < .5 ? floor : floor + 1;
                if (rounded == 0 && scaled < 0) rounded = -0d;
                return Number(rounded / scale);
            default: return Error("type");
        }
    }

    private CanopyCalculatedValue Compare(object? left, object? right) {
        var equal = _operation == "=" || _operation == "==" || _operation == "!=" || _operation == "<>";
        var negate = _operation == "!=" || _operation == "<>";
        if (left == null || right == null) return equal ? Result(negate != (left == null && right == null)) : Result(null);
        if (left.GetType() != right.GetType()) return Error("type");
        var order = left is string text ? string.CompareOrdinal(text, (string)right) :
            left is double number ? number.CompareTo((double)right) : ((bool)left).CompareTo((bool)right);
        switch (_operation) {
            case "=": case "==": return Result(order == 0);
            case "!=": case "<>": return Result(order != 0);
            case "<": return Result(order < 0);
            case "<=": return Result(order <= 0);
            case ">": return Result(order > 0);
            default: return Result(order >= 0);
        }
    }

    internal static CanopyCalculatedValue Result(object? value) => new CanopyCalculatedValue(value);
    internal static CanopyCalculatedValue Error(string error) => CanopyCalculatedValue.FromError(error);
    internal static CanopyCalculatedValue Number(double number) => double.IsNaN(number) || double.IsInfinity(number) ? Error("number-range") : Result(number == 0 ? 0d : number);
}
