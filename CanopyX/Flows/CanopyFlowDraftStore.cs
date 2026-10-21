namespace CanopyX;

/// <summary>Where a flow keeps its draft (<see cref="CanopyFlow.Draft"/>). Drafts never hold secrets or sensitive answers.</summary>
public enum CanopyFlowDraftStore {
    /// <summary>No draft. The default.</summary>
    None,

    /// <summary>The browser's session storage: the draft lasts while the tab does.</summary>
    Session,

    /// <summary>The browser's local storage, when the page opts in: the draft lasts until it is submitted or dropped.</summary>
    Local,

    /// <summary>The host's <c>draftStore { load, save, clear }</c> hook, or an endpoint's draft route.</summary>
    Host
}