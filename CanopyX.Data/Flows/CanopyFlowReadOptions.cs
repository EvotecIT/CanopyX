using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>
/// What the server needs to read a flow's requests beyond the flow itself: the fields of sections whose fields come from the
/// host, and the current options of fields whose options come from the host. Without them, answers to such fields are refused
/// (host sections) or checked only by their shape (host options).
/// </summary>
public sealed class CanopyFlowReadOptions {
    /// <summary>
    /// Gets or sets the fields of a host section (<see cref="CanopyFlowSection.IsFromHost"/>) for the given answers, as the
    /// <c>fields</c> route answers them; submissions and stored drafts check their answers against these definitions.
    /// </summary>
    public Func<CanopyFlowSection, IReadOnlyDictionary<string, object?>, IEnumerable<CanopyFlowField>>? SectionFields { get; set; }

    /// <summary>
    /// Gets or sets the fields of a host section, loaded asynchronously; <see cref="CanopyFlowSubmission.ParseRequestAsync"/> and
    /// <see cref="CanopyFlowResponses.DraftAsync"/> prefer it to <see cref="SectionFields"/>, and the synchronous readers ignore it.
    /// </summary>
    public Func<CanopyFlowSection, IReadOnlyDictionary<string, object?>, CancellationToken, Task<IEnumerable<CanopyFlowField>>>? SectionFieldsAsync { get; set; }

    /// <summary>
    /// Gets or sets the current options of a field whose options come from the host (<see cref="CanopyFlowOptionsSource.Host"/>)
    /// for the given answers, as the <c>options</c> route answers them; the submission refuses a value that is not among them or
    /// whose option is disabled.
    /// </summary>
    public Func<CanopyFlowField, IReadOnlyDictionary<string, object?>, IEnumerable<CanopyFlowOption>>? HostOptions { get; set; }

    /// <summary>
    /// Gets or sets the current options of a host-option field, loaded asynchronously; <see cref="CanopyFlowSubmission.ParseRequestAsync"/>
    /// prefers it to <see cref="HostOptions"/>, and the synchronous readers ignore it.
    /// </summary>
    public Func<CanopyFlowField, IReadOnlyDictionary<string, object?>, CancellationToken, Task<IEnumerable<CanopyFlowOption>>>? HostOptionsAsync { get; set; }
}
