namespace CanopyX;

/// <summary>Declares coherent flat-grid data and navigation modes. Hosts provide data hooks separately.</summary>
public sealed class CanopyGridSource {
    private CanopyGridSource(CanopyGridSourceKind kind, CanopyGridNavigation navigation) {
        Kind = kind;
        Navigation = navigation;
    }

    /// <summary>Gets whether the complete dataset is inline or supplied by a host.</summary>
    public CanopyGridSourceKind Kind { get; }

    /// <summary>Gets known-count offset access or opaque sequential cursor access.</summary>
    public CanopyGridNavigation Navigation { get; }

    /// <summary>Declares a complete inline dataset with local filtering and ordering.</summary>
    /// <returns>An inline source; the view supplies its rows.</returns>
    public static CanopyGridSource Inline() => new CanopyGridSource(CanopyGridSourceKind.Inline, CanopyGridNavigation.Offset);

    /// <summary>Declares host-owned full-query results with known counts and random offset access.</summary>
    /// <returns>A host source for continuous or paged presentation.</returns>
    public static CanopyGridSource HostedOffset() => new CanopyGridSource(CanopyGridSourceKind.Host, CanopyGridNavigation.Offset);

    /// <summary>Declares host-owned sequential cursor pages, whose counts may be unknown.</summary>
    /// <returns>A cursor source that makes its owning view use paged presentation.</returns>
    public static CanopyGridSource HostedCursor() => new CanopyGridSource(CanopyGridSourceKind.Host, CanopyGridNavigation.Cursor);
}
