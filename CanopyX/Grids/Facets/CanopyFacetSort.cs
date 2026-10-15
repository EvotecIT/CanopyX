namespace CanopyX;

/// <summary>How a value list orders its values.</summary>
public enum CanopyFacetSort {
    /// <summary>The most frequent values first, then by value.</summary>
    Count,
    /// <summary>By value, as the column's value lists order them, with the empty value last.</summary>
    Value
}
