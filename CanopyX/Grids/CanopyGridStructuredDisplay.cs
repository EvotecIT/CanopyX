namespace CanopyX;

/// <summary>How a structured presenter summarises a list, object or collection in a grid cell.</summary>
public enum CanopyGridStructuredDisplay {
    /// <summary>A count, for example "4 names" (<see cref="CanopyGridPresenter.CountText"/>).</summary>
    Count,
    /// <summary>The first items as chips, then "+N".</summary>
    Chips,
    /// <summary>The first item, then "+N".</summary>
    First
}
