using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>
/// Nested grouping keys. They are built as constructor calls that name their members, the shape of an
/// anonymous type, so LINQ providers translate them to a multi-column <c>GROUP BY</c>; in memory they compare by value.
/// </summary>
internal static class CompositeKeys {
    private static readonly Type[] Definitions = { typeof(CompositeKey<,>), typeof(CompositeKey<,,>), typeof(CompositeKey<,,,>) };

    /// <summary>A key over the given column expressions.</summary>
    internal static NewExpression New(IReadOnlyList<Expression> parts) {
        if (parts.Count < 2 || parts.Count > 38) throw new ArgumentOutOfRangeException(nameof(parts));
        if (parts.Count > 4) return New(parts.Take(3).Concat(new[] { (Expression)New(parts.Skip(3).ToArray()) }).ToArray());
        var type = Definitions[parts.Count - 2].MakeGenericType(parts.Select(part => part.Type).ToArray());
        return Expression.New(type.GetConstructors()[0], parts, Members(type));
    }

    /// <summary>The members of a key type, outermost column first.</summary>
    internal static PropertyInfo[] Members(Type type) => type.GetProperties().Where(property => property.Name.StartsWith("K", StringComparison.Ordinal))
        .OrderBy(property => property.Name, StringComparer.Ordinal).ToArray();

    /// <summary>The component values of a key, outermost column first.</summary>
    internal static object?[] Values(object key) => Members(key.GetType()).SelectMany(member => Nested(member.PropertyType) ? Values(member.GetValue(key)!) : new[] { member.GetValue(key) }).ToArray();

    /// <summary>Every scalar member access, including nested constructor members.</summary>
    internal static Expression[] Leaves(Expression key) => Members(key.Type).SelectMany(member => {
        var access = Expression.Property(key, member);
        return Nested(member.PropertyType) ? Leaves(access) : new Expression[] { access };
    }).ToArray();
    private static bool Nested(Type type) => type.IsGenericType && Definitions.Contains(type.GetGenericTypeDefinition());
}

/// <summary>A grouping key of two columns.</summary>
internal sealed class CompositeKey<T1, T2> : IEquatable<CompositeKey<T1, T2>> {
    public CompositeKey(T1 k1, T2 k2) { K1 = k1; K2 = k2; }
    public T1 K1 { get; }
    public T2 K2 { get; }
    public bool Equals(CompositeKey<T1, T2>? other) => other != null && EqualityComparer<T1>.Default.Equals(K1, other.K1) && EqualityComparer<T2>.Default.Equals(K2, other.K2);
    public override bool Equals(object? obj) => Equals(obj as CompositeKey<T1, T2>);
    public override int GetHashCode() => unchecked(EqualityComparer<T1>.Default.GetHashCode(K1!) * 31 + EqualityComparer<T2>.Default.GetHashCode(K2!));
}

/// <summary>A grouping key of three columns.</summary>
internal sealed class CompositeKey<T1, T2, T3> : IEquatable<CompositeKey<T1, T2, T3>> {
    public CompositeKey(T1 k1, T2 k2, T3 k3) { K1 = k1; K2 = k2; K3 = k3; }
    public T1 K1 { get; }
    public T2 K2 { get; }
    public T3 K3 { get; }
    public bool Equals(CompositeKey<T1, T2, T3>? other) => other != null && EqualityComparer<T1>.Default.Equals(K1, other.K1) &&
        EqualityComparer<T2>.Default.Equals(K2, other.K2) && EqualityComparer<T3>.Default.Equals(K3, other.K3);
    public override bool Equals(object? obj) => Equals(obj as CompositeKey<T1, T2, T3>);
    public override int GetHashCode() => unchecked((EqualityComparer<T1>.Default.GetHashCode(K1!) * 31 + EqualityComparer<T2>.Default.GetHashCode(K2!)) * 31 +
        EqualityComparer<T3>.Default.GetHashCode(K3!));
}

/// <summary>A grouping key of four columns.</summary>
internal sealed class CompositeKey<T1, T2, T3, T4> : IEquatable<CompositeKey<T1, T2, T3, T4>> {
    public CompositeKey(T1 k1, T2 k2, T3 k3, T4 k4) { K1 = k1; K2 = k2; K3 = k3; K4 = k4; }
    public T1 K1 { get; }
    public T2 K2 { get; }
    public T3 K3 { get; }
    public T4 K4 { get; }
    public bool Equals(CompositeKey<T1, T2, T3, T4>? other) => other != null && EqualityComparer<T1>.Default.Equals(K1, other.K1) &&
        EqualityComparer<T2>.Default.Equals(K2, other.K2) && EqualityComparer<T3>.Default.Equals(K3, other.K3) && EqualityComparer<T4>.Default.Equals(K4, other.K4);
    public override bool Equals(object? obj) => Equals(obj as CompositeKey<T1, T2, T3, T4>);
    public override int GetHashCode() => unchecked(((EqualityComparer<T1>.Default.GetHashCode(K1!) * 31 + EqualityComparer<T2>.Default.GetHashCode(K2!)) * 31 +
        EqualityComparer<T3>.Default.GetHashCode(K3!)) * 31 + EqualityComparer<T4>.Default.GetHashCode(K4!));
}
