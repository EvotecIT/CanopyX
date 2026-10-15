using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>Bounds the text of record values: a store reads at most one character past the limit, and the answer shortens
/// longer text to the limit with an ellipsis. Both providers end with <see cref="Clip"/>, so they answer alike.</summary>
internal static class RecordText {
    private static readonly MethodInfo Substring = typeof(string).GetMethod(nameof(string.Substring), new[] { typeof(int), typeof(int) })!;
    private static readonly PropertyInfo Length = typeof(string).GetProperty(nameof(string.Length))!;

    /// <summary>The text expression read as at most <paramref name="maximum"/> + 1 characters; other types stay as they are.</summary>
    internal static Expression Truncate(Expression text, int maximum) {
        if (text.Type != typeof(string)) return text;
        var take = ExpressionTools.Parameter(maximum + 1, typeof(int));
        return Expression.Condition(Expression.AndAlso(ExpressionTools.NotNull(text), Expression.GreaterThan(Expression.Property(text, Length), take)),
            Expression.Call(text, Substring, Expression.Constant(0), take), text);
    }

    /// <summary>Text longer than <paramref name="maximum"/> code units shortened to it (never inside a surrogate pair) with an ellipsis.</summary>
    internal static object? Clip(object? value, int maximum) {
        if (!(value is string text) || text.Length <= maximum) return value;
        var length = char.IsHighSurrogate(text[maximum - 1]) ? maximum - 1 : maximum;
        return text.Substring(0, length) + "…";
    }
}
