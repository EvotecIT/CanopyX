using System;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Options of <see cref="CanopyQueryableProvider{T}"/>.</summary>
public sealed class CanopyQueryOptions {
    /// <summary>Gets or sets how case-insensitive text matching is translated. Default <see cref="CanopyTextComparison.Auto"/>.</summary>
    public CanopyTextComparison TextComparison { get; set; }

    /// <summary>Gets or sets how queries are executed. Set an executor that uses your provider's asynchronous operators
    /// (for EF Core: <c>CountAsync</c>) to keep counts off the thread pool. Default <see cref="CanopyQueryExecutor.Default"/>.</summary>
    public CanopyQueryExecutor Executor { get; set; } = CanopyQueryExecutor.Default;

    /// <summary>Gets or sets the dataset revision. It must change whenever records may have changed, so clients reload
    /// instead of mixing snapshots. Default: the constant <c>live</c>, which offers no snapshot guarantee.</summary>
    public Func<CancellationToken, ValueTask<string>>? Revision { get; set; }
}
