namespace CanopyX;

/// <summary>The browser preference storage used by an explicitly keyed reporting grid.</summary>
public enum CanopyGridViewStorage {
    /// <summary>Keep view preferences within the current browser tab's session.</summary>
    Session,
    /// <summary>Keep view preferences across browser sessions on the current origin.</summary>
    /// <remarks>Searches, filters and selected identities are preferences with potentially sensitive content.</remarks>
    Local
}
