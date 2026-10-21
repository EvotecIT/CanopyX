using System;

namespace CanopyX;

/// <summary>The routes an endpoint serves below its URL (<see cref="CanopyFlowEndpoint.Routes"/>), each answering one hook of the flow.</summary>
[Flags]
public enum CanopyFlowRoutes {
    /// <summary>No route.</summary>
    None = 0,

    /// <summary><c>POST options</c>: the options of a field whose options come from the host.</summary>
    Options = 1,

    /// <summary><c>POST fields</c>: the fields of a section whose fields come from the host.</summary>
    Fields = 2,

    /// <summary><c>POST check</c>: runs a check.</summary>
    Check = 4,

    /// <summary><c>POST validate</c>: the host's step and flow rules.</summary>
    Validate = 8,

    /// <summary><c>POST preview</c>: the review page's preview of what submitting does.</summary>
    Preview = 16,

    /// <summary><c>POST status</c>: a task list's step states.</summary>
    Status = 32,

    /// <summary><c>GET</c>, <c>PUT</c> and <c>DELETE draft</c>: the draft store.</summary>
    Draft = 64,

    /// <summary><c>POST submit</c>: the proposal and its secrets.</summary>
    Submit = 128
}