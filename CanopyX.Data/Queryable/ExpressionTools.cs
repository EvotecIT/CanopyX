using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>Holds a value so that a LINQ provider sends it as a query parameter rather than inlining it.</summary>
internal sealed class Box<TValue> {
    public Box(TValue value) { Value = value; }
    public TValue Value { get; }
}

internal static class ExpressionTools {
    private static readonly MethodInfo FoldMethod = typeof(CanopyTextFolding).GetMethod(nameof(CanopyTextFolding.Fold), new[] { typeof(string) })!;
    private static readonly MethodInfo ToLowerMethod = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;
    internal static readonly MethodInfo ContainsMethod = typeof(string).GetMethod(nameof(string.Contains), new[] { typeof(string) })!;
    internal static readonly MethodInfo StartsWithMethod = typeof(string).GetMethod(nameof(string.StartsWith), new[] { typeof(string) })!;
    internal static readonly MethodInfo StartsWithOrdinalMethod = typeof(string).GetMethod(nameof(string.StartsWith), new[] { typeof(string), typeof(StringComparison) })!;
    private static readonly MethodInfo EnumerableContains = typeof(Enumerable).GetMethods()
        .Single(method => method.Name == nameof(Enumerable.Contains) && method.GetParameters().Length == 2);

    /// <summary>A parameterized value of the given type.</summary>
    internal static Expression Parameter(object? value, Type type) {
        var box = Activator.CreateInstance(typeof(Box<>).MakeGenericType(type), value)!;
        return Expression.Property(Expression.Constant(box), "Value");
    }

    /// <summary>A parameterized list of values, tested with <see cref="Enumerable.Contains{TSource}(IEnumerable{TSource}, TSource)"/>.</summary>
    internal static Expression InList(Expression item, IEnumerable<object?> values) {
        var listType = typeof(List<>).MakeGenericType(item.Type);
        var list = (System.Collections.IList)Activator.CreateInstance(listType)!;
        foreach (var value in values) list.Add(value);
        return Expression.Call(EnumerableContains.MakeGenericMethod(item.Type), Parameter(list, listType), item);
    }

    internal static Expression Fold(Expression text, CanopyTextComparison comparison) => comparison switch {
        CanopyTextComparison.Lowercase => Expression.Call(text, ToLowerMethod),
        CanopyTextComparison.Canonical => Expression.Call(FoldMethod, text),
        _ => text
    };

    internal static string FoldOperand(string text, CanopyTextComparison comparison) => comparison switch {
        CanopyTextComparison.Lowercase => text.ToLowerInvariant(),
        CanopyTextComparison.Canonical => CanopyTextFolding.Fold(text)!,
        _ => text
    };

    internal static bool IsNullable(Type type) => !type.IsValueType || Nullable.GetUnderlyingType(type) != null;

    internal static Type Underlying(Type type) => Nullable.GetUnderlyingType(type) ?? type;

    internal static Expression NotNull(Expression value) => Expression.NotEqual(value, Expression.Constant(null, value.Type));

    internal static Expression IsNull(Expression value) => Expression.Equal(value, Expression.Constant(null, value.Type));

    internal static Expression And(Expression? left, Expression right) => left == null ? right : Expression.AndAlso(left, right);

    internal static Expression Or(Expression? left, Expression right) => left == null ? right : Expression.OrElse(left, right);

    internal static Expression Constant(bool value) => Expression.Constant(value);

    /// <summary>Re-binds a mapped lambda to the shared row parameter.</summary>
    internal static Expression Bind(LambdaExpression lambda, ParameterExpression row, bool nullSafe) {
        var body = new ParameterReplacer(lambda.Parameters[0], row).Visit(lambda.Body)!;
        return nullSafe ? new NullSafeRewriter(row).Visit(body)! : body;
    }

    /// <summary>Whether a mapped member chain can never be null according to its value types and nullable reference annotations.</summary>
    internal static bool AnnotatedNotNull(LambdaExpression lambda) {
#if NET6_0_OR_GREATER
        var context = new NullabilityInfoContext();
        Expression? node = lambda.Body;
        while (node is UnaryExpression unary && (unary.NodeType == ExpressionType.Convert || unary.NodeType == ExpressionType.ConvertChecked)) node = unary.Operand;
        while (node is MemberExpression member) {
            var type = member.Type;
            if (Nullable.GetUnderlyingType(type) != null) return false;
            if (!type.IsValueType) {
                var state = member.Member switch {
                    PropertyInfo property => context.Create(property).ReadState,
                    FieldInfo field => context.Create(field).ReadState,
                    _ => NullabilityState.Unknown
                };
                if (state != NullabilityState.NotNull) return false;
            }
            node = member.Expression;
        }
        return node == lambda.Parameters[0];
#else
        return false;
#endif
    }

    private sealed class ParameterReplacer : ExpressionVisitor {
        private readonly ParameterExpression _from;
        private readonly Expression _to;
        internal ParameterReplacer(ParameterExpression from, Expression to) { _from = from; _to = to; }
        protected override Expression VisitParameter(ParameterExpression node) => node == _from ? _to : node;
    }

    /// <summary>Guards member chains through optional references, as a database does, so in-memory queries see missing values instead of failing.</summary>
    private sealed class NullSafeRewriter : ExpressionVisitor {
        private readonly ParameterExpression _row;
        internal NullSafeRewriter(ParameterExpression row) { _row = row; }

        protected override Expression VisitMember(MemberExpression node) {
            if (node.Expression == null) return node;
            var inner = Visit(node.Expression)!;
            if (inner == _row || inner.Type.IsValueType && Nullable.GetUnderlyingType(inner.Type) == null) return node.Update(inner);
            var target = Nullable.GetUnderlyingType(inner.Type) != null ? Expression.Convert(inner, Underlying(inner.Type)) : inner;
            Expression access = Expression.MakeMemberAccess(target, node.Member);
            var type = access.Type;
            if (type.IsValueType && Nullable.GetUnderlyingType(type) == null) {
                type = typeof(Nullable<>).MakeGenericType(type);
                access = Expression.Convert(access, type);
            }
            return Expression.Condition(IsNull(inner), Expression.Constant(null, type), access);
        }
    }
}
