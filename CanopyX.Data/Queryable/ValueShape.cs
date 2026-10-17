using System;

namespace CanopyX.Data;

/// <summary>The store type family of a mapped column, independent of nullability.</summary>
internal enum ValueShape {
    Text,
    Boolean,
    Enum,
    Integer,
    Real,
    Decimal,
    DateTime,
    DateTimeOffset,
    DateOnly
}

internal static class ValueShapes {
    internal static ValueShape Of(Type type, string column) {
        var t = ExpressionTools.Underlying(type);
        if (t == typeof(string)) return ValueShape.Text;
        if (t == typeof(bool)) return ValueShape.Boolean;
        if (t.IsEnum) return ValueShape.Enum;
        if (t == typeof(sbyte) || t == typeof(byte) || t == typeof(short) || t == typeof(ushort) || t == typeof(int) || t == typeof(uint) || t == typeof(long) || t == typeof(ulong)) return ValueShape.Integer;
        if (t == typeof(float) || t == typeof(double)) return ValueShape.Real;
        if (t == typeof(decimal)) return ValueShape.Decimal;
        if (t == typeof(DateTime)) return ValueShape.DateTime;
        if (t == typeof(DateTimeOffset)) return ValueShape.DateTimeOffset;
        if (t.FullName == "System.DateOnly") return ValueShape.DateOnly;
        throw new ArgumentException("Column '" + column + "' maps to " + t.Name + ", which has no CanopyX raw value shape. Map strings, booleans, enumerations, numbers or dates; project other types to text.");
    }

    internal static bool Fits(ValueShape shape, CanopyColumnKind kind) => kind switch {
        CanopyColumnKind.Text => shape == ValueShape.Text || shape == ValueShape.Boolean || shape == ValueShape.Enum,
        CanopyColumnKind.Number => shape == ValueShape.Integer || shape == ValueShape.Real || shape == ValueShape.Decimal,
        CanopyColumnKind.DateTime => shape == ValueShape.DateTime || shape == ValueShape.DateTimeOffset || shape == ValueShape.DateOnly,
        _ => false
    };

    /// <summary>Whether a type is one of the integer types a column maps.</summary>
    internal static bool IsInteger(Type type) {
        var t = ExpressionTools.Underlying(type);
        return t == typeof(sbyte) || t == typeof(byte) || t == typeof(short) || t == typeof(ushort) || t == typeof(int) || t == typeof(uint) || t == typeof(long) || t == typeof(ulong);
    }

    /// <summary>The inclusive range of an integer type, as binary64.</summary>
    internal static (double Minimum, double Maximum) Range(Type type) {
        var t = ExpressionTools.Underlying(type);
        if (t == typeof(sbyte)) return (sbyte.MinValue, sbyte.MaxValue);
        if (t == typeof(byte)) return (byte.MinValue, byte.MaxValue);
        if (t == typeof(short)) return (short.MinValue, short.MaxValue);
        if (t == typeof(ushort)) return (ushort.MinValue, ushort.MaxValue);
        if (t == typeof(int)) return (int.MinValue, int.MaxValue);
        if (t == typeof(uint)) return (uint.MinValue, uint.MaxValue);
        if (t == typeof(ulong)) return (0, 9007199254740991d);
        return (-9007199254740991d, 9007199254740991d);
    }
}
