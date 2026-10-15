using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CanopyX.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CanopyX.AspNetCore;

/// <summary>Maps the CanopyX remote grid protocol to minimal-API endpoints.</summary>
/// <remarks>
/// The returned route group serves, below its pattern:
/// <list type="bullet">
/// <item><c>POST query</c>: a <c>gridQuery</c> body, answered with a <c>gridPage</c>; with <see cref="CanopyRemoteEndpointOptions.AllowGetQueries"/>, <c>GET query</c> reads the same query from the query string.</item>
/// <item><c>POST facet</c>: a <c>gridFacetQuery</c> body, answered with a <c>gridFacetPage</c> (value lists).</item>
/// <item><c>POST summary</c>: a <c>gridQuery</c> body with its revision, answered with a <c>gridSummary</c> (groups and aggregates).</item>
/// <item><c>POST export/{format}</c>: the grid's export request, answered with a streamed file.</item>
/// <item><c>GET view</c>: the grid definition document.</item>
/// <item><c>POST commit</c> (with <see cref="CanopyRemoteEndpointOptions.Writer"/>): a <c>gridCommit</c> body, answered with a
/// <c>gridCommitResult</c>; it requires <see cref="CanopyRemoteEndpointOptions.WriteAuthorizationPolicy"/> as well.</item>
/// <item><c>POST record</c> (with <see cref="CanopyRemoteEndpointOptions.Records"/>): a <c>gridRecordQuery</c> body, answered with a
/// <c>gridRecord</c>; a record that is missing or outside the caller's scope answers 404 <c>recordNotFound</c>.</item>
/// </list>
/// POST bodies must be JSON (<c>application/json</c>), which makes cross-origin pages go through a CORS preflight. Client
/// errors return 400 (409 for a stale revision, 404 for a record that is not available, 413 for an oversized body, 415 for another content type) with
/// <c>{ "error": code, "message": text }</c>; server failures return a generic 500 body and are logged, never echoed.
/// Requests observe <see cref="HttpContext.RequestAborted"/>. The group requires authorization (the default policy, or
/// <see cref="CanopyRemoteEndpointOptions.AuthorizationPolicy"/>) unless <see cref="CanopyRemoteEndpointOptions.AllowAnonymous"/> is set;
/// apply rate limiting and CORS to the returned group as well.
/// </remarks>
public static class CanopyRemoteEndpointExtensions {
    /// <summary>Maps remote grid endpoints over an <see cref="IQueryable{T}"/>.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="endpoints">The route builder.</param>
    /// <param name="pattern">The route prefix, for example <c>/api/hosts</c>.</param>
    /// <param name="query">Returns the base query for a request, already restricted to what the caller may see.</param>
    /// <param name="map">The column allow-list.</param>
    /// <param name="configure">Adjusts limits, export formats and query options.</param>
    /// <returns>The route group, for authorization and other conventions.</returns>
    public static RouteGroupBuilder MapCanopyRemote<T>(this IEndpointRouteBuilder endpoints, string pattern, Func<HttpContext, IQueryable<T>> query,
        CanopyColumnMap<T> map, Action<CanopyRemoteEndpointOptions>? configure = null) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        if (map == null) throw new ArgumentNullException(nameof(map));
        var options = new CanopyRemoteEndpointOptions();
        configure?.Invoke(options);
        var queryOptions = options.Query;
        return Map(endpoints, pattern, map.Schema, context => new CanopyQueryableProvider<T>(() => query(context), map, queryOptions), options);
    }

    /// <summary>Maps remote grid endpoints over an <see cref="IQueryable{T}"/>, with a record route that loads record details
    /// through the same query callback.</summary>
    /// <typeparam name="T">The record type.</typeparam>
    /// <param name="endpoints">The route builder.</param>
    /// <param name="pattern">The route prefix, for example <c>/api/hosts</c>.</param>
    /// <param name="query">Returns the base query for a request, already restricted to what the caller may see. Record
    /// lookups compose on it too, so a record outside the caller's scope is not found.</param>
    /// <param name="map">The column allow-list.</param>
    /// <param name="records">The record allow-list, built over <paramref name="map"/>.</param>
    /// <param name="configure">Adjusts limits, export formats, query options and the record read check.</param>
    /// <returns>The route group, for authorization and other conventions.</returns>
    /// <exception cref="ArgumentException">The record map belongs to another column map.</exception>
    /// <exception cref="InvalidOperationException"><paramref name="configure"/> also sets <see cref="CanopyRemoteEndpointOptions.Records"/>.</exception>
    public static RouteGroupBuilder MapCanopyRemote<T>(this IEndpointRouteBuilder endpoints, string pattern, Func<HttpContext, IQueryable<T>> query,
        CanopyColumnMap<T> map, CanopyRecordMap<T> records, Action<CanopyRemoteEndpointOptions>? configure = null) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        if (map == null) throw new ArgumentNullException(nameof(map));
        if (records == null) throw new ArgumentNullException(nameof(records));
        if (!ReferenceEquals(records.Columns, map)) throw new ArgumentException("The record map must be built over the same column map.", nameof(records));
        var options = new CanopyRemoteEndpointOptions();
        configure?.Invoke(options);
        if (options.Records != null) throw new InvalidOperationException("The record map already supplies the record provider; do not set Records as well.");
        var queryOptions = options.Query;
        _ = records.Schema;
        options.Records = context => new CanopyQueryableRecordProvider<T>(() => query(context), records, queryOptions);
        return Map(endpoints, pattern, map.Schema, context => new CanopyQueryableProvider<T>(() => query(context), map, queryOptions), options);
    }

    /// <summary>Maps remote grid endpoints over a custom data provider, for example raw SQL.</summary>
    /// <param name="endpoints">The route builder.</param>
    /// <param name="pattern">The route prefix.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="provider">Returns the provider for a request.</param>
    /// <param name="configure">Adjusts limits and export formats.</param>
    /// <returns>The route group, for authorization and other conventions.</returns>
    public static RouteGroupBuilder MapCanopyRemote(this IEndpointRouteBuilder endpoints, string pattern, CanopyDataSchema schema,
        Func<HttpContext, ICanopyDataProvider> provider, Action<CanopyRemoteEndpointOptions>? configure = null) {
        if (provider == null) throw new ArgumentNullException(nameof(provider));
        var options = new CanopyRemoteEndpointOptions();
        configure?.Invoke(options);
        return Map(endpoints, pattern, schema, provider, options);
    }

    private static RouteGroupBuilder Map(IEndpointRouteBuilder endpoints, string pattern, CanopyDataSchema schema, Func<HttpContext, ICanopyDataProvider> provider,
        CanopyRemoteEndpointOptions options) {
        if (endpoints == null) throw new ArgumentNullException(nameof(endpoints));
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        if (string.IsNullOrEmpty(pattern)) throw new ArgumentException("A route pattern is required.", nameof(pattern));
        var writePolicy = string.IsNullOrWhiteSpace(options.WriteAuthorizationPolicy) ? null : options.WriteAuthorizationPolicy;
        if (options.Writer != null && writePolicy == null && !options.AllowAnonymousWrites)
            throw new InvalidOperationException("Name the WriteAuthorizationPolicy the commit route requires. The default policy would let every reader write; AllowAnonymousWrites is for local samples only.");
        if (options.Writer != null && options.Remote.WriterProblem == null) {
            var logger = endpoints.ServiceProvider.GetService<ILoggerFactory>()?.CreateLogger("CanopyX.AspNetCore");
            if (logger != null) options.Remote.WriterProblem = problem => logger.LogWarning("A CanopyX commit answer was corrected: {Problem}", problem);
        }
        var group = endpoints.MapGroup(pattern);
        if (!options.AllowAnonymous) {
            if (options.AuthorizationPolicy == null) group.RequireAuthorization(); else group.RequireAuthorization(options.AuthorizationPolicy);
        }
        if (options.Writer != null) {
            var writer = options.Writer;
            var anonymousWrites = options.AllowAnonymousWrites;
            var commit = group.MapPost("/commit", (RequestDelegate)(context => {
                // AllowAnonymous on the group (or the route) makes authorization skip the write policy; writes then refuse
                // unless anonymous writes were chosen explicitly.
                if (!anonymousWrites && context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() != null)
                    return CanopyRemoteHttp.WriteErrorAsync(context, StatusCodes.Status403Forbidden, "writeNotAllowed", "This endpoint does not accept anonymous changes.");
                return CanopyRemoteHttp.RunJsonAsync(context, options.Limits, http => new CanopyRemoteHandler(schema, provider(http), options.Remote, writer(http)), CommitAnswer);
            }));
            if (writePolicy != null) commit.RequireAuthorization(writePolicy);
        }
        if (options.Records != null) {
            var records = options.Records;
            var canRead = options.CanReadRecordField;
            Task Record(HttpContext context) {
                Func<string, bool>? check = canRead == null ? null : id => canRead(context, id);
                Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> answer = (handler, body, token) => handler.RecordAsync(body, check, token);
                return CanopyRemoteHttp.RunJsonAsync(context, options.Limits, http => new CanopyRemoteHandler(schema, provider(http), options.Remote, null, records(http)), answer);
            }
            var route = group.MapPost("/record", (RequestDelegate)Record);
            options.RecordEndpoint?.Invoke(route);
        }
        var view = schema.ToJson();
        CanopyRemoteHandler Handler(HttpContext context) => new CanopyRemoteHandler(schema, provider(context), options.Remote);

        group.MapPost("/query", Json(Handler, options.Limits, QueryAnswer));
        if (options.AllowGetQueries) {
            group.MapGet("/query", (RequestDelegate)(context => CanopyRemoteHttp.RunAsync(context, async token => {
                var parameters = context.Request.Query.SelectMany(pair => pair.Value.Select(value => new KeyValuePair<string, string?>(pair.Key, value)));
                await CanopyRemoteHttp.WriteJsonAsync(context, await Handler(context).QueryAsync(parameters, token).ConfigureAwait(false), token).ConfigureAwait(false);
            })));
        }
        group.MapPost("/facet", Json(Handler, options.Limits, FacetAnswer));
        group.MapPost("/summary", Json(Handler, options.Limits, SummaryAnswer));
        group.MapPost("/export/{format}", (RequestDelegate)(context => CanopyRemoteHttp.RunAsync(context, async token => {
            var body = await CanopyRemoteHttp.ReadJsonBodyAsync(context, options.Limits, token).ConfigureAwait(false);
            if (body == null) return;
            var format = context.Request.RouteValues["format"] as string ?? string.Empty;
            var job = await Handler(context).PrepareExportAsync(body, format, token).ConfigureAwait(false);
            await CanopyRemoteHttp.WriteExportAsync(context, job, token).ConfigureAwait(false);
        })));
        group.MapGet("/view", (RequestDelegate)(context => CanopyRemoteHttp.RunAsync(context, token => CanopyRemoteHttp.WriteJsonAsync(context, view, token))));
        return group;
    }

    private static readonly Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> QueryAnswer = (handler, body, token) => handler.QueryAsync(body, token);
    private static readonly Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> FacetAnswer = (handler, body, token) => handler.FacetAsync(body, token);
    private static readonly Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> SummaryAnswer = (handler, body, token) => handler.SummaryAsync(body, token);
    private static readonly Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> CommitAnswer = (handler, body, token) => handler.CommitAsync(body, token);

    private static RequestDelegate Json(Func<HttpContext, CanopyRemoteHandler> handler, CanopyRemoteLimits limits,
        Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> answer) =>
        context => CanopyRemoteHttp.RunJsonAsync(context, limits, handler, answer);
}
