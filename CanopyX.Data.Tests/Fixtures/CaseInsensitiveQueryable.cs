using System.Collections;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data.Tests;

/// <summary>
/// LINQ to objects with a case-insensitive text collation, as a database with a case-insensitive column collation behaves:
/// text equality ignores case, and grouping joins spellings that differ in case, reporting the first spelling it meets.
/// The CanopyX providers see it as a database (it is not an EnumerableQuery).
/// </summary>
public static class CaseInsensitiveQueryable {
    public static IQueryable<T> Create<T>(IEnumerable<T> records) => new Query<T>(new Provider(), Expression.Constant(records.AsQueryable()));

    private sealed class Query<T> : IQueryable<T>, IOrderedQueryable<T> {
        public Query(Provider provider, Expression expression) { Provider = provider; Expression = expression; }
        public Type ElementType => typeof(T);
        public Expression Expression { get; }
        public IQueryProvider Provider { get; }
        public IEnumerator<T> GetEnumerator() => ((Provider)Provider).Run<T>(Expression).GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    private sealed class Provider : IQueryProvider {
        private static readonly IQueryProvider Objects = Enumerable.Empty<int>().AsQueryable().Provider;

        public IQueryable CreateQuery(Expression expression) {
            var element = expression.Type.GetInterfaces().Concat(new[] { expression.Type })
                .First(type => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IQueryable<>)).GetGenericArguments()[0];
            return (IQueryable)Activator.CreateInstance(typeof(Query<>).MakeGenericType(element), this, expression)!;
        }
        public IQueryable<TElement> CreateQuery<TElement>(Expression expression) => new Query<TElement>(this, expression);
        public object? Execute(Expression expression) => Objects.Execute(new Collation().Visit(expression)!);
        public TResult Execute<TResult>(Expression expression) => Objects.Execute<TResult>(new Collation().Visit(expression)!);
        internal IEnumerable<T> Run<T>(Expression expression) => Objects.CreateQuery<T>(new Collation().Visit(expression)!);
    }

    /// <summary>Rewrites text equality and grouping keys to compare text case-insensitively.</summary>
    private sealed class Collation : ExpressionVisitor {
        private static readonly MethodInfo EqualsIgnoringCase = typeof(string).GetMethod(nameof(string.Equals), new[] { typeof(string), typeof(string), typeof(StringComparison) })!;

        protected override Expression VisitBinary(BinaryExpression node) {
            if ((node.NodeType == ExpressionType.Equal || node.NodeType == ExpressionType.NotEqual) && node.Left.Type == typeof(string) && node.Right.Type == typeof(string)) {
                Expression test = Expression.Call(EqualsIgnoringCase, Visit(node.Left)!, Visit(node.Right)!, Expression.Constant(StringComparison.OrdinalIgnoreCase));
                return node.NodeType == ExpressionType.Equal ? test : Expression.Not(test);
            }
            return base.VisitBinary(node);
        }

        protected override Expression VisitMethodCall(MethodCallExpression node) {
            if (node.Method.DeclaringType == typeof(Queryable) && node.Method.Name == nameof(Queryable.GroupBy) && node.Arguments.Count == 2) {
                var arguments = node.Method.GetGenericArguments();
                var withComparer = typeof(Queryable).GetMethods().Single(method => method.Name == nameof(Queryable.GroupBy) && method.GetGenericArguments().Length == 2 &&
                    method.GetParameters().Length == 3 && method.GetParameters()[2].ParameterType.IsGenericType &&
                    method.GetParameters()[2].ParameterType.GetGenericTypeDefinition() == typeof(IEqualityComparer<>)).MakeGenericMethod(arguments);
                var comparer = Activator.CreateInstance(typeof(KeyComparer<>).MakeGenericType(arguments[1]))!;
                return Expression.Call(withComparer, Visit(node.Arguments[0])!, Visit(node.Arguments[1])!, Expression.Constant(comparer, typeof(IEqualityComparer<>).MakeGenericType(arguments[1])));
            }
            return base.VisitMethodCall(node);
        }
    }

    /// <summary>Compares grouping keys (a value or a composite of values) with text compared case-insensitively.</summary>
    private sealed class KeyComparer<TKey> : IEqualityComparer<TKey> {
        public bool Equals(TKey? x, TKey? y) => Parts(x).SequenceEqual(Parts(y), Part.Instance);
        public int GetHashCode(TKey obj) => Parts(obj).Aggregate(17, (hash, part) => hash * 31 + Part.Instance.GetHashCode(part!));
        private static IEnumerable<object?> Parts(object? key) => key != null && key.GetType().Name.StartsWith("CompositeKey", StringComparison.Ordinal)
            ? key.GetType().GetProperties().Where(property => property.Name.StartsWith("K", StringComparison.Ordinal)).OrderBy(property => property.Name).Select(property => property.GetValue(key))
            : new object?[] { key }.AsEnumerable();
    }

    private sealed class Part : IEqualityComparer<object?> {
        public static readonly Part Instance = new Part();
        public new bool Equals(object? x, object? y) => x is string a && y is string b ? string.Equals(a, b, StringComparison.OrdinalIgnoreCase) : object.Equals(x, y);
        public int GetHashCode(object? obj) => obj is string text ? StringComparer.OrdinalIgnoreCase.GetHashCode(text) : obj?.GetHashCode() ?? 0;
    }
}
