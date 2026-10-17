using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Executes validated remote grid requests against a data store.</summary>
/// <remarks>
/// <para>
/// <see cref="CanopyQueryableProvider{T}"/> implements this interface over any <see cref="System.Linq.IQueryable{T}"/>;
/// <see cref="CanopyInMemoryProvider{T}"/> is the reference implementation of the exact protocol semantics. Implement it
/// directly for a back end without a LINQ provider, such as raw SQL through a micro-ORM: every request arrives
/// validated, references only allowed columns and carries typed operands, so an implementation maps column identities
/// to its own fixed expressions and passes every operand as a query parameter, never as SQL text.
/// </para>
/// <para>
/// Ordering contract: apply the sort keys in order with missing values last in both directions, then stable record
/// identity ascending. When a request has grouping levels (<see cref="CanopyDataRequest.Levels"/>: the fixed grouping or
/// the query's <c>groupBy</c>), order records level by level first, each level's groups in their order (by value, or by
/// the level's aggregate over the group, see <see cref="CanopySummaryLevel"/>), then by the other sort keys and identity,
/// so pages, exports and the group ranges <see cref="SummarizeAsync"/> reports agree.
/// </para>
/// <para>Methods that a back end cannot serve throw <see cref="CanopyRequestException"/> with <see cref="CanopyRequestError.Unsupported"/>.</para>
/// </remarks>
public interface ICanopyDataProvider {
    /// <summary>Gets the current dataset revision. It changes whenever records, their order or counts may have changed.</summary>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>A nonempty revision identifier.</returns>
    ValueTask<string> GetRevisionAsync(CancellationToken cancellationToken);

    /// <summary>Returns one window of ordered matching records with the dataset and matching counts.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The page result.</returns>
    ValueTask<CanopyPageResult> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken);

    /// <summary>Counts the records matching a request, ignoring its window.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The matching count.</returns>
    ValueTask<int> CountAsync(CanopyDataRequest request, CancellationToken cancellationToken);

    /// <summary>Streams ordered matching records from the request's offset, at most its limit, without buffering the result.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the enumeration.</param>
    /// <returns>The records.</returns>
    IAsyncEnumerable<CanopyGridRow> ReadAsync(CanopyDataRequest request, CancellationToken cancellationToken);

    /// <summary>Returns distinct values of one column with their counts over the complete query.</summary>
    /// <param name="request">The validated value-list request.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The value list.</returns>
    ValueTask<CanopyFacetResult> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken);

    /// <summary>Returns the declared aggregates over the complete query, and per group of every grouping level of the request,
    /// with each level's groups nested in the group of the level above.</summary>
    /// <param name="request">The validated summary request.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The summary.</returns>
    ValueTask<CanopySummaryResult> SummarizeAsync(CanopySummaryRequest request, CancellationToken cancellationToken);
}
