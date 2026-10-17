namespace CanopyX;

/// <summary>Where a record panel's details come from.</summary>
public enum CanopyRecordSourceKind {
    /// <summary>Rows and nodes carry their record fields.</summary>
    Inline,
    /// <summary>The browser host loads each record when its drawer opens.</summary>
    Host,
    /// <summary>Record packs beside the page, loaded when a drawer opens; they work from <c>file://</c>.</summary>
    Sidecar
}
