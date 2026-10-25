namespace CanopyX;

/// <summary>A host-supplied annotation on one occurrence of a record in a path.</summary>
/// <remarks>Annotations never compute relationships or prevent the record panel from opening.</remarks>
public enum CanopyPathFlag {
    /// <summary>The host marks this step as revisiting a record or relationship.</summary>
    Cycle,
    /// <summary>The host marks this step as crossing a boundary it defines.</summary>
    Foreign,
    /// <summary>The host marks this step as disabled; its details remain readable.</summary>
    Disabled
}
