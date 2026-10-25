namespace CanopyX;

/// <summary>The accepted records a footer aggregates, before any static rendering row limit.</summary>
public enum CanopyGridFooterScope {
    /// <summary>The complete matching query, independently of cached or rendered pages.</summary>
    All,
    /// <summary>The accepted result page before static row limits; continuous grids use all matching records.</summary>
    Page
}
