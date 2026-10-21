using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using CanopyX.Data;
using Microsoft.AspNetCore.Http;

namespace CanopyX.AspNetCore;

/// <summary>
/// The host's answers to a flow's routes (<see cref="CanopyFlowEndpointExtensions.MapCanopyFlow"/>). Each handler that is set maps
/// its route; <see cref="Routes"/> names them for <see cref="CanopyFlow.UseEndpoint"/>. Handlers observe
/// <see cref="HttpContext.RequestAborted"/> for cancellation.
/// </summary>
public sealed class CanopyFlowHandlers {
    /// <summary>Gets or sets the options of a field whose options come from the host (<c>POST options</c>).</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<IEnumerable<CanopyFlowOption>>>? Options { get; set; }

    /// <summary>Gets or sets the fields of a host section (<c>POST fields</c>); the submit route reads their answers with the same handler.</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<IEnumerable<CanopyFlowField>>>? Fields { get; set; }

    /// <summary>Gets or sets a server check (<c>POST check</c>); <see cref="CanopyFlowRequest.ReadSecret"/> reads the secrets it tests.</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<CanopyFlowCheckResult>>? Check { get; set; }

    /// <summary>Gets or sets the host's rules for a step or the whole flow (<c>POST validate</c>).</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<CanopyFlowValidationResult>>? Validate { get; set; }

    /// <summary>Gets or sets the review page's preview (<c>POST preview</c>).</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<CanopyFlowPreview>>? Preview { get; set; }

    /// <summary>Gets or sets a task list's step states by step id (<c>POST status</c>).</summary>
    public Func<HttpContext, CanopyFlowRequest, Task<IReadOnlyDictionary<string, CanopyFlowStepStatus>>>? Status { get; set; }

    /// <summary>Gets or sets the draft store (<c>GET</c>, <c>PUT</c> and <c>DELETE draft</c>).</summary>
    public ICanopyFlowDraftStore? Drafts { get; set; }

    /// <summary>Gets or sets what applies a proposal (<c>POST submit</c>), read and checked by the server first.</summary>
    public Func<HttpContext, CanopyFlowSubmission, Task<CanopyFlowAnswer>>? Submit { get; set; }

    /// <summary>Gets the routes the handlers map, for <see cref="CanopyFlow.UseEndpoint"/>.</summary>
    public CanopyFlowRoutes Routes =>
        (Options != null ? CanopyFlowRoutes.Options : CanopyFlowRoutes.None) | (Fields != null ? CanopyFlowRoutes.Fields : CanopyFlowRoutes.None) |
        (Check != null ? CanopyFlowRoutes.Check : CanopyFlowRoutes.None) | (Validate != null ? CanopyFlowRoutes.Validate : CanopyFlowRoutes.None) |
        (Preview != null ? CanopyFlowRoutes.Preview : CanopyFlowRoutes.None) | (Status != null ? CanopyFlowRoutes.Status : CanopyFlowRoutes.None) |
        (Drafts != null ? CanopyFlowRoutes.Draft : CanopyFlowRoutes.None) | (Submit != null ? CanopyFlowRoutes.Submit : CanopyFlowRoutes.None);
}