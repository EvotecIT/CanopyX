namespace CanopyX;

/// <summary>
/// Where the runtime reads a view's nodes from.
/// </summary>
public enum CanopySourceKind {
    /// <summary>The nodes travel inside the view document (single-file pages).</summary>
    Inline = 0,

    /// <summary>The nodes live in sidecar script files written by the bundle writer, loadable from <c>file://</c>.</summary>
    Sidecar,

    /// <summary>The nodes come from HTTP endpoints that answer with <c>canopyx/2</c> documents.</summary>
    Remote
}
