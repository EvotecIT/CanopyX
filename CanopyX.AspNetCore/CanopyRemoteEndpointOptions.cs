using System;
using System.Linq;
using CanopyX.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace CanopyX.AspNetCore;

/// <summary>Options of endpoints mapped by <see cref="CanopyRemoteEndpointExtensions"/>.</summary>
public sealed class CanopyRemoteEndpointOptions {
    /// <summary>Gets the protocol options: safety limits and export formats.</summary>
    public CanopyRemoteOptions Remote { get; } = new CanopyRemoteOptions();

    /// <summary>Gets the safety limits (shortcut for <c>Remote.Limits</c>).</summary>
    public CanopyRemoteLimits Limits => Remote.Limits;

    /// <summary>Gets or sets the queryable options (text comparison, executor, revision) used by the <c>IQueryable</c> overload.</summary>
    public CanopyQueryOptions Query { get; set; } = new CanopyQueryOptions();

    /// <summary>Gets or sets the authorization policy the endpoints require. Null requires the default policy.</summary>
    /// <remarks>Endpoints require authorization unless <see cref="AllowAnonymous"/> is set; register authorization services and middleware.</remarks>
    public string? AuthorizationPolicy { get; set; }

    /// <summary>Gets or sets whether the endpoints may be called without authorization. Default false: there is no anonymous default.</summary>
    public bool AllowAnonymous { get; set; }

    /// <summary>Gets or sets the writer that saves commits, created per request; null maps no commit route.</summary>
    /// <remarks>
    /// With a writer, <c>POST commit</c> answers <c>gridCommit</c> documents. It requires <see cref="WriteAuthorizationPolicy"/>
    /// on top of the read authorization of the group, so writers must also be readers. Return a new writer per request: the
    /// endpoint disposes a disposable writer when the response completes. Over an <c>IQueryable</c>,
    /// <see cref="UseQueryableWriter{T}"/> is shorter and scopes writes to the grid's query.
    /// </remarks>
    public Func<HttpContext, ICanopyDataWriter>? Writer { get; set; }

    /// <summary>Saves commits with a <see cref="CanopyQueryableWriter{T}"/> whose <see cref="CanopyQueryableWriterOptions{T}.Scope"/>
    /// is the grid's own query callback, so a commit changes only records the caller can read.</summary>
    /// <typeparam name="T">The record type of the grid's query.</typeparam>
    /// <param name="store">Returns the unit of work of a request, for example an EF Core adapter over the request's
    /// <c>DbContext</c>. The endpoint disposes a disposable store when the response completes.</param>
    /// <param name="configure">Adjusts the writer per request: revision, saving step, inserts, logging. It must leave
    /// <see cref="CanopyQueryableWriterOptions{T}.Scope"/> alone; set <see cref="Writer"/> for a scope other than the grid's query.</param>
    /// <remarks>Only the <c>MapCanopyRemote</c> overloads that take an <see cref="System.Linq.IQueryable{T}"/> callback accept it,
    /// and <see cref="Writer"/> must stay null. The commit route still requires <see cref="WriteAuthorizationPolicy"/>.</remarks>
    public void UseQueryableWriter<T>(Func<HttpContext, ICanopyWriteStore<T>> store, Action<HttpContext, CanopyQueryableWriterOptions<T>>? configure = null) where T : class {
        if (store == null) throw new ArgumentNullException(nameof(store));
        QueryableWriter = new Func<CanopyColumnMap<T>, Func<HttpContext, IQueryable<T>>, Func<HttpContext, ICanopyDataWriter>>((map, query) => http => {
            var options = new CanopyQueryableWriterOptions<T>();
            configure?.Invoke(http, options);
            if (options.Scope != null || options.AllowUnscoped)
                throw new InvalidOperationException("UseQueryableWriter scopes writes by the grid's query; set Writer to choose another scope.");
            options.Scope = () => query(http);
            return new CanopyQueryableWriter<T>(map, CanopyRemoteEndpointExtensions.Owned(http, store(http)), options);
        });
    }

    /// <summary>The writer <see cref="UseQueryableWriter{T}"/> binds to the grid's map and query callback.</summary>
    internal Delegate? QueryableWriter { get; private set; }

    /// <summary>Gets or sets the authorization policy the commit route requires, distinct from the read policy.</summary>
    /// <remarks>Mapping a writer without a write policy fails unless <see cref="AllowAnonymousWrites"/> is set: the default
    /// policy would let every reader write.</remarks>
    public string? WriteAuthorizationPolicy { get; set; }

    /// <summary>Gets or sets whether the commit route needs no write policy. Default false; meant for local samples only.
    /// The route still requires the read authorization unless <see cref="AllowAnonymous"/> is set too.</summary>
    public bool AllowAnonymousWrites { get; set; }

    /// <summary>Gets or sets the provider that loads record details, created per request; null maps no record route.</summary>
    /// <remarks>
    /// With records, <c>POST record</c> answers <c>gridRecordQuery</c> documents under the same authorization as the reads, with
    /// bodies bounded by <see cref="CanopyRemoteLimits.MaxRecordRequestBytes"/>. The
    /// provider must find records only among those the caller may read, as the query callback does: the
    /// <c>MapCanopyRemote</c> overload that takes a <see cref="CanopyRecordMap{T}"/> sets this to the grid's own query callback.
    /// Return a new provider per request: the endpoint disposes a disposable one when the response completes.
    /// </remarks>
    public Func<HttpContext, ICanopyRecordProvider>? Records { get; set; }

    /// <summary>Gets or sets the per-request read check of record fields and columns' drawer values (by identity); false leaves
    /// the field out of the answer, as an empty field. Null serves every mapped field.</summary>
    /// <remarks>It hides whole fields only, never single collection rows, timeline events or changes: restrict those in the
    /// field's mapping. Grid columns, and so the record's row, follow the column map as page rows do: leave out of the map what
    /// a caller must not read.</remarks>
    public Func<HttpContext, string, bool>? CanReadRecordField { get; set; }

    /// <summary>Gets or sets conventions applied to the record route alone, for example
    /// <c>route =&gt; route.RequireRateLimiting("records")</c>; conventions on the returned group apply to every route.</summary>
    /// <remarks>Rate-limit the record route in production: each request builds a bounded answer on demand (a key lookup plus
    /// a count and a window per collection), so an unthrottled caller can make the server build many of them.</remarks>
    public Action<IEndpointConventionBuilder>? RecordEndpoint { get; set; }

    /// <summary>Gets or sets whether a <c>GET</c> route also answers queries given in the query string. Default false.</summary>
    /// <remarks>Query strings end up in access logs, proxies and referrers, so search text and filters travel in POST bodies by default.</remarks>
    public bool AllowGetQueries { get; set; }
}
