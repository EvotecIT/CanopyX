using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using CanopyX.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CanopyX.AspNetCore;

/// <summary>Maps a flow's hooks to minimal-API routes, so a flow page needs no script of its own (see "An endpoint" in docs/flow.md).</summary>
/// <remarks>
/// The returned route group serves, below its pattern, one route per handler set in <see cref="CanopyFlowHandlers"/>:
/// <list type="bullet">
/// <item><c>POST options</c>, <c>POST fields</c>, <c>POST check</c>, <c>POST validate</c>, <c>POST preview</c> and <c>POST status</c>:
/// a request of the reader's answers (<see cref="CanopyFlowRequest"/>), answered with the handler's result.</item>
/// <item><c>GET</c>, <c>PUT</c> and <c>DELETE draft</c>: the caller's draft, through <see cref="ICanopyFlowDraftStore"/>; <c>PUT</c> keeps
/// only a well-formed draft of the flow without secrets or sensitive answers.</item>
/// <item><c>POST submit</c>: the proposal and the secrets it sets, read and checked by <see cref="CanopyFlowSubmission.ParseRequestAsync"/>.
/// Answers that fail the flow's checks return an error answer with messages beside the fields, without calling the handler; a
/// stale baseline returns a conflict (<see cref="CanopyFlowEndpointOptions.RejectStaleBaseline"/>).</item>
/// </list>
/// The flow callback builds the flow for each request, as the page that rendered it did (edit-mode values, stored secrets and
/// baseline included): the server reads every request against it and never trusts the browser's copy. Bodies must be JSON
/// (<c>application/json</c>), which makes cross-origin pages go through a CORS preflight. Client errors return 400 (413 for an
/// oversized body, 415 for another content type) with <c>{ "error": code, "message": text }</c>; server failures return a generic
/// 500 body and are logged, never echoed. The group requires authorization (the default policy, or
/// <see cref="CanopyFlowEndpointOptions.AuthorizationPolicy"/>) unless <see cref="CanopyFlowEndpointOptions.AllowAnonymous"/> is set;
/// apply rate limiting, CORS and antiforgery to the returned group as well, and point the flow at it with
/// <c>flow.UseEndpoint(url, handlers.Routes)</c>.
/// </remarks>
public static class CanopyFlowEndpointExtensions {
    /// <summary>Maps a flow's routes.</summary>
    /// <param name="endpoints">The route builder.</param>
    /// <param name="pattern">The route prefix, for example <c>/api/flows/mail</c>; the flow's <see cref="CanopyFlow.UseEndpoint"/> names the same path.</param>
    /// <param name="flow">Builds the flow for a request.</param>
    /// <param name="handlers">The host's answers; each handler that is set maps its route.</param>
    /// <param name="configure">Adjusts authorization, limits and the submit route's checks.</param>
    /// <returns>The route group, for authorization and other conventions.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="pattern"/> is empty, or <paramref name="handlers"/> sets none.</exception>
    public static RouteGroupBuilder MapCanopyFlow(this IEndpointRouteBuilder endpoints, string pattern, Func<HttpContext, CanopyFlow> flow, CanopyFlowHandlers handlers,
        Action<CanopyFlowEndpointOptions>? configure = null) {
        if (endpoints == null) throw new ArgumentNullException(nameof(endpoints));
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        if (handlers == null) throw new ArgumentNullException(nameof(handlers));
        if (string.IsNullOrEmpty(pattern)) throw new ArgumentException("A route pattern is required.", nameof(pattern));
        if (handlers.Routes == CanopyFlowRoutes.None) throw new ArgumentException("Set at least one handler.", nameof(handlers));
        var options = new CanopyFlowEndpointOptions();
        configure?.Invoke(options);
        var limits = new CanopyRemoteLimits();
        var group = endpoints.MapGroup(pattern);
        if (!options.AllowAnonymous) {
            if (options.AuthorizationPolicy == null) group.RequireAuthorization(); else group.RequireAuthorization(options.AuthorizationPolicy);
        }

        void Post<T>(string route, CanopyFlowRoutes kind, Func<HttpContext, CanopyFlowRequest, Task<T>>? handler, Func<CanopyFlowRequest, T, string> write) {
            if (handler == null) return;
            group.MapPost("/" + route, (RequestDelegate)(context => Run(context, limits, options, async (body, token) => {
                var request = CanopyFlowRequest.Parse(flow(context), kind, body);
                return write(request, await handler(context, request).ConfigureAwait(false));
            })));
        }

        Post("options", CanopyFlowRoutes.Options, handlers.Options, (request, list) => CanopyFlowResponses.Options(request.Field!, list));
        Post("fields", CanopyFlowRoutes.Fields, handlers.Fields, (request, fields) => CanopyFlowResponses.Fields(request.Flow, request.Section!, fields));
        Post("check", CanopyFlowRoutes.Check, handlers.Check, (request, result) => Require(result, "check").ToJson());
        Post("validate", CanopyFlowRoutes.Validate, handlers.Validate, (request, result) => Require(result, "validate").ToJson());
        Post("preview", CanopyFlowRoutes.Preview, handlers.Preview, (request, preview) => Require(preview, "preview").ToJson());
        Post("status", CanopyFlowRoutes.Status, handlers.Status, (request, states) => CanopyFlowStepStatus.ToJson(Require(states, "status")));
        if (handlers.Drafts != null) MapDrafts(group, flow, handlers.Drafts, handlers.Fields, limits, options);
        if (handlers.Submit != null) {
            var submit = handlers.Submit;
            group.MapPost("/submit", (RequestDelegate)(context => Run(context, limits, options, async (body, token) => {
                var current = flow(context);
                var read = ReadOptions(context, current, handlers.Fields, handlers.Options, options.HostOptions);
                CanopyFlowSubmission submission;
                try {
                    submission = await CanopyFlowSubmission.ParseRequestAsync(current, body, read, token).ConfigureAwait(false);
                } catch (CanopyFlowSubmissionException error) {
                    return error.ToAnswer().ToJson();
                }

                if (options.RejectStaleBaseline && !submission.IsCurrent) return CanopyFlowAnswer.Conflict().ToJson();
                return Require(await submit(context, submission).ConfigureAwait(false), "submit").ToJson();
            })));
        }

        return group;
    }

    /// <summary>The submit route reads host sections' fields with the fields handler, and host options with the endpoint's
    /// HostOptions callback or, without one, the options handler.</summary>
    private static CanopyFlowReadOptions ReadOptions(HttpContext context, CanopyFlow flow, Func<HttpContext, CanopyFlowRequest, Task<IEnumerable<CanopyFlowField>>>? fields,
        Func<HttpContext, CanopyFlowRequest, Task<IEnumerable<CanopyFlowOption>>>? optionsHandler,
        Func<HttpContext, CanopyFlowField, IReadOnlyDictionary<string, object?>, IEnumerable<CanopyFlowOption>>? hostOptions) {
        var read = new CanopyFlowReadOptions();
        if (fields != null) read.SectionFieldsAsync = (section, values, cancel) => fields(context, CanopyFlowRequest.ForSection(flow, section, values));
        if (hostOptions != null) read.HostOptions = (field, values) => hostOptions(context, field, values);
        else if (optionsHandler != null) read.HostOptionsAsync = (field, values, cancel) => optionsHandler(context, CanopyFlowRequest.ForField(flow, field, values));
        return read;
    }

    private static void MapDrafts(RouteGroupBuilder group, Func<HttpContext, CanopyFlow> flow, ICanopyFlowDraftStore store,
        Func<HttpContext, CanopyFlowRequest, Task<IEnumerable<CanopyFlowField>>>? fields, CanopyRemoteLimits limits, CanopyFlowEndpointOptions options) {
        group.MapGet("/draft", (RequestDelegate)(context => CanopyRemoteHttp.RunAsync(context, async token => {
            var draft = await store.LoadAsync(context, flow(context).Id, token).ConfigureAwait(false);
            await CanopyRemoteHttp.WriteJsonAsync(context, string.IsNullOrEmpty(draft) ? "null" : draft!, token).ConfigureAwait(false);
        })));
        group.MapPut("/draft", (RequestDelegate)(context => Run(context, limits, options, async (body, token) => {
            var current = flow(context);
            var draft = await CanopyFlowResponses.DraftAsync(current, body, ReadOptions(context, current, fields, null, null), token).ConfigureAwait(false);
            await store.SaveAsync(context, current.Id, draft, token).ConfigureAwait(false);
            return "{}";
        })));
        group.MapDelete("/draft", (RequestDelegate)(context => CanopyRemoteHttp.RunAsync(context, async token => {
            await store.ClearAsync(context, flow(context).Id, token).ConfigureAwait(false);
            await CanopyRemoteHttp.WriteJsonAsync(context, "{}", token).ConfigureAwait(false);
        })));
    }

    private static Task Run(HttpContext context, CanopyRemoteLimits limits, CanopyFlowEndpointOptions options, Func<string, CancellationToken, Task<string>> answer) =>
        CanopyRemoteHttp.RunAsync(context, async token => {
            var body = await CanopyRemoteHttp.ReadJsonBodyAsync(context, limits, token, options.MaxRequestBytes).ConfigureAwait(false);
            if (body == null) return;
            await CanopyRemoteHttp.WriteJsonAsync(context, await answer(body, token).ConfigureAwait(false), token).ConfigureAwait(false);
        });

    private static T Require<T>(T? value, string route) where T : class =>
        value ?? throw new InvalidOperationException("The " + route + " handler answered null.");
}
