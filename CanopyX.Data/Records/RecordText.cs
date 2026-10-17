using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>Bounds the text of record values: a store reads at most one character past the limit (enough to tell text that
/// fits from longer text), and the answer shortens longer text so that it ends with an ellipsis and still fits the limit.
/// Both providers end with <see cref="Clip(object, int)"/>, and the endpoint clips every provider's answer again, so all answer alike.</summary>
internal static class RecordText {
    /// <summary>The ellipsis that ends shortened text.</summary>
    internal const string Ellipsis = "…";

    private static readonly MethodInfo Substring = typeof(string).GetMethod(nameof(string.Substring), new[] { typeof(int), typeof(int) })!;
    private static readonly PropertyInfo Length = typeof(string).GetProperty(nameof(string.Length))!;

    /// <summary>The text expression read as at most <paramref name="maximum"/> + 1 characters; other types stay as they are.</summary>
    /// <remarks>Text of exactly <paramref name="maximum"/> code units is answered whole, so the store must read one more to
    /// show that text is longer. A store that counts characters as code points reads more code units, never fewer, and
    /// <see cref="Clip(string, int)"/> bounds the result either way.</remarks>
    internal static Expression Truncate(Expression text, int maximum) {
        if (text.Type != typeof(string)) return text;
        var take = ExpressionTools.Parameter(maximum + 1, typeof(int));
        return Expression.Condition(Expression.AndAlso(ExpressionTools.NotNull(text), Expression.GreaterThan(Expression.Property(text, Length), take)),
            Expression.Call(text, Substring, Expression.Constant(0), take), text);
    }

    /// <summary>Text longer than <paramref name="maximum"/> code units shortened, ellipsis included, to at most that many
    /// (never inside a surrogate pair); shorter text and other values stay as they are.</summary>
    internal static object? Clip(object? value, int maximum) => value is string text ? Clip(text, maximum) : value;

    /// <summary>Text longer than <paramref name="maximum"/> code units shortened, ellipsis included, to at most that many
    /// (never inside a surrogate pair); null and shorter text stay as they are.</summary>
    internal static string? Clip(string? text, int maximum) {
        if (text == null || text.Length <= maximum) return text;
        var length = maximum - Ellipsis.Length;
        if (length > 0 && char.IsHighSurrogate(text[length - 1])) length--;
        return text.Substring(0, length) + Ellipsis;
    }
}
