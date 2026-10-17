using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>An optional capability of an <see cref="ICanopyDataProvider"/>: answering date-range requests (<c>gridRangeQuery</c>)
/// for calendar and timeline views.</summary>
/// <remarks>
/// <see cref="CanopyQueryableProvider{T}"/> and <see cref="CanopyInMemoryProvider{T}"/> implement it. A provider without it answers
/// range requests with <see cref="CanopyRequestError.Unsupported"/>. A custom provider can count and read
/// <see cref="CanopyRangeRequest.Selection"/>, which expresses the range as an ordinary filtered, sorted request.
/// </remarks>
public interface ICanopyRangeProvider {
    /// <summary>Counts the records that overlap the request's window and returns the first of them in start order.</summary>
    /// <param name="request">The validated range request.</param>
    /// <param name="cancellationToken">Cancels the operation.</param>
    /// <returns>The overlapping count and at most <see cref="CanopyRangeRequest.Limit"/> records, ordered by start ascending and
    /// then by record identity.</returns>
    ValueTask<CanopyRangeResult> RangeAsync(CanopyRangeRequest request, CancellationToken cancellationToken);
}
