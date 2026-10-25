using System;
using System.Globalization;

namespace CanopyX;

/// <summary>Normalizes only supported scalar inputs, without invoking host conversion hooks.</summary>
internal static class CanopyCalculationValues {
    internal static CanopyCalculatedValue Read(object? value) {
        if (value is CanopyCalculatedValue result) {
            if (result.IsError) return result;
            value = result.Value;
        }
        if (value == null || value is bool) return CanopyCalculationNode.Result(value);
        if (value is string text) return text.Length > 4096 ? CanopyCalculationNode.Error("text-limit") : CanopyCalculationNode.Result(text);
        if (value is DateTime date) {
            // Unspecified dates are UTC, matching CanopyCell. Local dates honor their explicit Kind.
            return CanopyCalculationNode.Result(CanopyCell.FormatIso(date.Kind == DateTimeKind.Local ? date.ToUniversalTime() : DateTime.SpecifyKind(date, DateTimeKind.Utc)));
        }
        if (value is DateTimeOffset offset) return CanopyCalculationNode.Result(CanopyCell.FormatIso(offset.UtcDateTime));
        if (value is byte || value is sbyte || value is short || value is ushort || value is int || value is uint ||
            value is long || value is ulong || value is float || value is double || value is decimal) {
            var number = value is decimal exact ? CanopyNumericValues.DecimalToDouble(exact) : Convert.ToDouble(value, CultureInfo.InvariantCulture);
            return CanopyCalculationNode.Number(number);
        }
        return CanopyCalculationNode.Error("type");
    }
}
