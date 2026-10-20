using System;
using CanopyX.Data;
using Microsoft.AspNetCore.Http;

namespace CanopyX.AspNetCore;

/// <summary>Options of the routes <see cref="CanopyFlowEndpointExtensions.MapCanopyFlow"/> maps.</summary>
public sealed class CanopyFlowEndpointOptions {
    private int _maxRequestBytes = 1024 * 1024;

    /// <summary>Gets or sets the authorization policy the routes require. Null requires the default policy.</summary>
    /// <remarks>The routes require authorization unless <see cref="AllowAnonymous"/> is set; register authorization services and middleware.</remarks>
    public string? AuthorizationPolicy { get; set; }

    /// <summary>Gets or sets whether the routes may be called without authorization. Default false: there is no anonymous default.</summary>
    public bool AllowAnonymous { get; set; }

    /// <summary>Gets or sets the largest request body, in bytes, from 1 KiB to 16 MiB. Default 1 MiB.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The size is outside 1 KiB to 16 MiB.</exception>
    public int MaxRequestBytes {
        get => _maxRequestBytes;
        set => _maxRequestBytes = value < 1024 || value > 16 * 1024 * 1024 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A request limit is 1 KiB to 16 MiB.") : value;
    }

    /// <summary>
    /// Gets or sets whether the submit route answers <see cref="CanopyFlowAnswer.Conflict"/> itself when the proposal's baseline is
    /// not the flow's (the settings changed since the reader opened the flow). Default true; false leaves the decision to the
    /// submit handler, which reads <see cref="CanopyFlowSubmission.IsCurrent"/>.
    /// </summary>
    public bool RejectStaleBaseline { get; set; } = true;

    /// <summary>
    /// Gets or sets the current options of host-option fields for the submit route, so it refuses a value the host no longer
    /// offers; null asks <see cref="CanopyFlowHandlers.Options"/> instead, and without either those answers are checked by their
    /// shape only. Host sections' fields come from <see cref="CanopyFlowHandlers.Fields"/>.
    /// </summary>
    public Func<HttpContext, CanopyFlowField, System.Collections.Generic.IReadOnlyDictionary<string, object?>, System.Collections.Generic.IEnumerable<CanopyFlowOption>>? HostOptions { get; set; }
}