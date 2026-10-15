using System;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Compares keys with the grid's key, for record fields kept within the caller's grid query.</summary>
internal static class RecordScope {
    /// <summary>Two key expressions in one comparable type: equal types as they are, otherwise both as the nullable underlying type.</summary>
    internal static (Expression Left, Expression Right) SameType(Expression left, Expression right) {
        if (left.Type == right.Type) return (left, right);
        var type = ExpressionTools.Underlying(left.Type);
        if (type != ExpressionTools.Underlying(right.Type)) throw new InvalidOperationException("A key compared with the grid's key must have the grid key's type.");
        var nullable = type.IsValueType ? typeof(Nullable<>).MakeGenericType(type) : type;
        return (left.Type == nullable ? left : Expression.Convert(left, nullable), right.Type == nullable ? right : Expression.Convert(right, nullable));
    }

    /// <summary>Whether two key types compare: the same underlying type.</summary>
    internal static bool Comparable(Type left, Type right) => ExpressionTools.Underlying(left) == ExpressionTools.Underlying(right);
}
