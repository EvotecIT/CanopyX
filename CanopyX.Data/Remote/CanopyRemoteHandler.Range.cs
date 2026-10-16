using System;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    /// <summary>Answers a <c>gridRangeQuery</c> document with a <c>gridRangePage</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The range document.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid, its revision is stale, or the provider does not answer
    /// date ranges (<see cref="CanopyRequestError.Unsupported"/>).</exception>
    public Task<string> RangeAsync(string json, CancellationToken cancellationToken = default) =>
        RangeAsync(CanopyRequestParser.ParseRange(json, Schema, Options.Limits), cancellationToken);

    /// <summary>Answers a validated range request with a <c>gridRangePage</c> document.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The range document.</returns>
    /// <exception cref="CanopyRequestException">The revision is stale, the records changed while they were read, or the provider
    /// does not implement <see cref="ICanopyRangeProvider"/> (<see cref="CanopyRequestError.Unsupported"/>).</exception>
    public async Task<string> RangeAsync(CanopyRangeRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        if (!(Provider is ICanopyRangeProvider ranges)) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not answer date-range requests.");
        var revision = await RevisionAsync(request.Query.Revision, cancellationToken).ConfigureAwait(false);
        var result = await ranges.RangeAsync(request, cancellationToken).ConfigureAwait(false);
        // Records written between the count and the read change the answer; the client reloads instead of mixing snapshots.
        if (result.Rows.Count != Math.Min(request.Limit, result.Matched)) throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The data changed; reload the grid.");
        var page = new CanopyGridRangePage(Schema.ViewId, revision, request.Start.Id, request.From, request.To, result.Matched);
        foreach (var row in result.Rows) page.Rows.Add(row);
        return page.ToJson(Schema.ProtocolView);
    }
}
