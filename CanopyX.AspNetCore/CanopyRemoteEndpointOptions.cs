using System;
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
    /// on top of the read authorization of the group, so writers must also be readers.
    /// </remarks>
    public Func<HttpContext, ICanopyDataWriter>? Writer { get; set; }

    /// <summary>Gets or sets the authorization policy the commit route requires, distinct from the read policy.</summary>
    /// <remarks>Mapping a writer without a write policy fails unless <see cref="AllowAnonymousWrites"/> is set: the default
    /// policy would let every reader write.</remarks>
    public string? WriteAuthorizationPolicy { get; set; }

    /// <summary>Gets or sets whether the commit route needs no write policy. Default false; meant for local samples only.
    /// The route still requires the read authorization unless <see cref="AllowAnonymous"/> is set too.</summary>
    public bool AllowAnonymousWrites { get; set; }

    /// <summary>Gets or sets the provider that loads record details, created per request; null maps no record route.</summary>
    /// <remarks>
    /// With records, <c>POST record</c> answers <c>gridRecordQuery</c> documents under the same authorization as the reads. The
    /// provider must find records only among those the caller may read, as the query callback does: the
    /// <c>MapCanopyRemote</c> overload that takes a <see cref="CanopyRecordMap{T}"/> sets this to the grid's own query callback.
    /// </remarks>
    public Func<HttpContext, ICanopyRecordProvider>? Records { get; set; }

    /// <summary>Gets or sets the per-request read check of record fields and columns' drawer values (by identity); false leaves
    /// the field out of the answer, as an empty field. Null serves every mapped field.</summary>
    /// <remarks>Grid columns, and so the record's row, follow the column map as page rows do: leave out of the map what a caller
    /// must not read.</remarks>
    public Func<HttpContext, string, bool>? CanReadRecordField { get; set; }

    /// <summary>Gets or sets conventions applied to the record route alone, for example
    /// <c>route =&gt; route.RequireRateLimiting("records")</c>; conventions on the returned group apply to every route.</summary>
    public Action<IEndpointConventionBuilder>? RecordEndpoint { get; set; }

    /// <summary>Gets or sets whether a <c>GET</c> route also answers queries given in the query string. Default false.</summary>
    /// <remarks>Query strings end up in access logs, proxies and referrers, so search text and filters travel in POST bodies by default.</remarks>
    public bool AllowGetQueries { get; set; }
}
