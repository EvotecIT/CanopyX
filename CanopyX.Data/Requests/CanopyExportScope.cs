namespace CanopyX.Data;

/// <summary>Which records an export contains. Every scope keeps the accepted sort order.</summary>
public enum CanopyExportScope {
    /// <summary>The records matching the accepted search and filters (what the reader sees).</summary>
    Filtered = 0,
    /// <summary>The selected records: explicit identities across the dataset, or an all-matching selection with exclusions.</summary>
    Selected,
    /// <summary>Every record, without search or filters.</summary>
    All
}
