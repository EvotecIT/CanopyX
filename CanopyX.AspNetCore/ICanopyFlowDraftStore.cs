using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace CanopyX.AspNetCore;

/// <summary>
/// Keeps a flow's drafts for the <c>draft</c> route of <see cref="CanopyFlowEndpointExtensions.MapCanopyFlow"/>: one draft per
/// flow and caller. The store decides who the caller is (for example <see cref="HttpContext.User"/>); drafts never hold secrets
/// or sensitive answers, which <see cref="CanopyX.Data.CanopyFlowResponses.Draft"/> checks before <see cref="SaveAsync"/>.
/// </summary>
public interface ICanopyFlowDraftStore {
    /// <summary>Loads the caller's draft of a flow.</summary>
    /// <param name="context">The request.</param>
    /// <param name="flowId">The flow's id.</param>
    /// <param name="cancellationToken">Cancels the load.</param>
    /// <returns>The draft as JSON, or null when there is none.</returns>
    Task<string?> LoadAsync(HttpContext context, string flowId, CancellationToken cancellationToken);

    /// <summary>Saves the caller's draft of a flow, replacing any earlier one.</summary>
    /// <param name="context">The request.</param>
    /// <param name="flowId">The flow's id.</param>
    /// <param name="draftJson">The draft, as compact JSON.</param>
    /// <param name="cancellationToken">Cancels the save.</param>
    /// <returns>A task that completes when the draft is saved.</returns>
    Task SaveAsync(HttpContext context, string flowId, string draftJson, CancellationToken cancellationToken);

    /// <summary>Removes the caller's draft of a flow.</summary>
    /// <param name="context">The request.</param>
    /// <param name="flowId">The flow's id.</param>
    /// <param name="cancellationToken">Cancels the removal.</param>
    /// <returns>A task that completes when the draft is gone.</returns>
    Task ClearAsync(HttpContext context, string flowId, CancellationToken cancellationToken);
}