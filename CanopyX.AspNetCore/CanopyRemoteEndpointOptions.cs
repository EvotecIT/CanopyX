using CanopyX.Data;

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

    /// <summary>Gets or sets whether a <c>GET</c> route also answers queries given in the query string. Default false.</summary>
    /// <remarks>Query strings end up in access logs, proxies and referrers, so search text and filters travel in POST bodies by default.</remarks>
    public bool AllowGetQueries { get; set; }
}
