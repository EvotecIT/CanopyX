using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Executes the queries <see cref="CanopyQueryableProvider{T}"/> builds.</summary>
/// <remarks>
/// The default implementation enumerates asynchronously when the query implements <see cref="IAsyncEnumerable{T}"/>
/// (EF Core queries do) and counts asynchronously when the query provider has an asynchronous <c>ExecuteAsync</c>
/// (EF Core's <c>IAsyncQueryProvider</c>); other providers count synchronously. Derive from this class to use other
/// asynchronous operators, for example:
/// <code>
/// sealed class EfExecutor : CanopyQueryExecutor {
///     public override Task&lt;int&gt; CountAsync&lt;TSource&gt;(IQueryable&lt;TSource&gt; query, CancellationToken token) =&gt; query.CountAsync(token);
/// }
/// </code>
/// </remarks>
public class CanopyQueryExecutor {
    /// <summary>Gets the default executor.</summary>
    public static CanopyQueryExecutor Default { get; } = new CanopyQueryExecutor();

    /// <summary>Counts the elements of a query.</summary>
    /// <typeparam name="TSource">The element type.</typeparam>
    /// <param name="query">The query.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The count.</returns>
    public virtual Task<int> CountAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        cancellationToken.ThrowIfCancellationRequested();
        var execute = AsyncExecute(query.Provider.GetType());
        if (execute == null) return Task.FromResult(query.Count());
        var count = Expression.Call(typeof(Queryable), nameof(Queryable.Count), new[] { typeof(TSource) }, query.Expression);
        try {
            return (Task<int>)execute.MakeGenericMethod(typeof(Task<int>)).Invoke(query.Provider, new object[] { count, cancellationToken })!;
        } catch (TargetInvocationException error) when (error.InnerException != null) {
            ExceptionDispatchInfo.Capture(error.InnerException).Throw();
            throw;
        }
    }

    /// <summary>Finds an <c>ExecuteAsync&lt;TResult&gt;(Expression, CancellationToken)</c> on an asynchronous query provider interface
    /// (EF Core's <c>IAsyncQueryProvider</c> has this shape), so counts run asynchronously without a dependency on that provider.</summary>
    private static MethodInfo? AsyncExecute(Type provider) => AsyncProviders.GetOrAdd(provider, type => {
        foreach (var contract in type.GetInterfaces()) {
            if (contract.Name != "IAsyncQueryProvider") continue;
            foreach (var method in contract.GetMethods()) {
                var parameters = method.GetParameters();
                if (method.Name == "ExecuteAsync" && method.IsGenericMethodDefinition && parameters.Length == 2 &&
                    parameters[0].ParameterType == typeof(Expression) && parameters[1].ParameterType == typeof(CancellationToken)) return method;
            }
        }
        return null;
    });

    private static readonly ConcurrentDictionary<Type, MethodInfo?> AsyncProviders = new ConcurrentDictionary<Type, MethodInfo?>();

    /// <summary>Materializes a query.</summary>
    /// <typeparam name="TSource">The element type.</typeparam>
    /// <param name="query">The query.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The elements.</returns>
    public virtual async Task<List<TSource>> ToListAsync<TSource>(IQueryable<TSource> query, CancellationToken cancellationToken) {
        var list = new List<TSource>();
        await foreach (var item in StreamAsync(query, cancellationToken).ConfigureAwait(false)) list.Add(item);
        return list;
    }

    /// <summary>Streams a query without buffering it.</summary>
    /// <typeparam name="TSource">The element type.</typeparam>
    /// <param name="query">The query.</param>
    /// <param name="cancellationToken">Cancels the enumeration.</param>
    /// <returns>The elements.</returns>
    public virtual async IAsyncEnumerable<TSource> StreamAsync<TSource>(IQueryable<TSource> query, [EnumeratorCancellation] CancellationToken cancellationToken) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        if (query is IAsyncEnumerable<TSource> asynchronous) {
            await foreach (var item in asynchronous.WithCancellation(cancellationToken).ConfigureAwait(false)) yield return item;
            yield break;
        }
        foreach (var item in query) {
            cancellationToken.ThrowIfCancellationRequested();
            yield return item;
        }
    }
}
