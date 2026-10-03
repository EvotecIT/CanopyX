namespace CanopyX;

/// <summary>Where a flat data grid obtains its rows.</summary>
public enum CanopyGridSourceKind {
    /// <summary>The view carries all rows; queries run over the complete inline dataset.</summary>
    Inline = 0,

    /// <summary>A host hook evaluates queries and returns revisioned result pages.</summary>
    /// <remarks>The host can use an in-memory dataset, sidecar files, or a remote service.</remarks>
    Host
}
