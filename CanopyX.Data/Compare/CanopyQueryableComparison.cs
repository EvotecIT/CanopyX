using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Reads two host-owned queries and delegates their stable-key join to the dependency-free dataset comparer.</summary>
public static class CanopyQueryableComparison {
    /// <summary>Reads each complete version sequentially, maps records to core rows and compares them by ordinal row ID.</summary>
    /// <typeparam name="TBefore">The earlier query's projected record type.</typeparam>
    /// <typeparam name="TAfter">The later query's projected record type.</typeparam>
    /// <param name="before">The authorized, host-scoped earlier query.</param>
    /// <param name="after">The authorized, host-scoped later query.</param>
    /// <param name="mapBefore">Maps an earlier projected record to a stable-key row, in memory.</param>
    /// <param name="mapAfter">Maps a later projected record to a stable-key row, in memory.</param>
    /// <param name="rowLimit">Maximum records in each version, 100,000 by default. An extra record rejects the comparison rather than truncating it.</param>
    /// <param name="columns">Optional unique core cell IDs to compare; null discovers their union.</param>
    /// <param name="executor">Optional host query executor; null uses the existing asynchronous-aware executor.</param>
    /// <param name="cancellationToken">Cancels reads, mapping boundaries and the core join.</param>
    /// <returns>The complete in-memory comparison. No provider, transaction or transport is retained.</returns>
    /// <remarks>
    /// <para>The host owns authorization, filters, projection, deterministic OrderBy and snapshot consistency across both
    /// queries. Use immutable versions or a host-owned snapshot transaction spanning this call; two ordinary live queries
    /// do not establish a consistent snapshot. Independent ordered page windows are not complete datasets and must not
    /// be compared as such. Queries are read sequentially so they can share a provider context that forbids parallel reads.</para>
    /// <para>Take(rowLimit + 1) bounds each query and overflow is an error. Memory is proportional to both complete rowsets
    /// and their cell payloads. Map only required columns; use host query projection before invoking this method when the
    /// provider should select fewer fields. Mapping delegates run in memory and need not be provider-translatable.</para>
    /// <para>Cancellation is cooperative. Asynchronous providers receive the token through CanopyQueryExecutor; synchronous
    /// providers cannot interrupt an in-flight MoveNext. Hosts requiring command interruption must configure their provider
    /// or executor. This adapter creates no transaction, snapshot, retry, provider dependency or database write.</para>
    /// </remarks>
    /// <exception cref="ArgumentNullException">A query or mapping delegate is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The row limit is not positive or cannot reserve an overflow record.</exception>
    /// <exception cref="InvalidOperationException">A version exceeds the limit or a mapper returns null.</exception>
    /// <exception cref="ArgumentException">A mapped version contains duplicate keys or the core comparison columns are invalid.</exception>
    public static async Task<CanopyDatasetComparison> CompareAsync<TBefore, TAfter>(IQueryable<TBefore> before,
        IQueryable<TAfter> after, Func<TBefore, CanopyGridRow> mapBefore, Func<TAfter, CanopyGridRow> mapAfter,
        int rowLimit = 100000, IEnumerable<string>? columns = null, CanopyQueryExecutor? executor = null,
        CancellationToken cancellationToken = default) {
        if (before == null) throw new ArgumentNullException(nameof(before));
        if (after == null) throw new ArgumentNullException(nameof(after));
        if (mapBefore == null) throw new ArgumentNullException(nameof(mapBefore));
        if (mapAfter == null) throw new ArgumentNullException(nameof(mapAfter));
        if (rowLimit < 1 || rowLimit == int.MaxValue) throw new ArgumentOutOfRangeException(nameof(rowLimit));
        cancellationToken.ThrowIfCancellationRequested();
        var reader = executor ?? CanopyQueryExecutor.Default;
        var earlier = await ReadAsync(before, mapBefore, rowLimit, reader, "before", cancellationToken).ConfigureAwait(false);
        var later = await ReadAsync(after, mapAfter, rowLimit, reader, "after", cancellationToken).ConfigureAwait(false);
        return CanopyDatasetComparer.Compare(earlier, later, columns, cancellationToken);
    }

    private static async Task<List<CanopyGridRow>> ReadAsync<T>(IQueryable<T> query, Func<T, CanopyGridRow> map,
        int limit, CanopyQueryExecutor executor, string version, CancellationToken token) {
        var rows = new List<CanopyGridRow>();
        await foreach (var record in executor.StreamAsync(query.Take(limit + 1), token).ConfigureAwait(false)) {
            token.ThrowIfCancellationRequested();
            if (rows.Count == limit) throw new InvalidOperationException("The " + version + " comparison dataset exceeds the per-version row limit of " + limit + ".");
            var row = map(record) ?? throw new InvalidOperationException("The " + version + " comparison mapper returned a null row.");
            token.ThrowIfCancellationRequested();
            rows.Add(row);
        }
        token.ThrowIfCancellationRequested();
        return rows;
    }
}
