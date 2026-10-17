namespace CanopyX;

/// <summary>How a facet shows its column.</summary>
public enum CanopyFacetKind {
    /// <summary>A value list for text columns, a range for number and date columns.</summary>
    Auto,
    /// <summary>The column's values with their counts, to tick.</summary>
    List,
    /// <summary>From and To bounds with a histogram of the values (number and date columns).</summary>
    Range
}
