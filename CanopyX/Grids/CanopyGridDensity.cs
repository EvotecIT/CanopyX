namespace CanopyX;

/// <summary>Chooses Graphite row spacing. An explicitly assigned row height takes precedence.</summary>
public enum CanopyGridDensity {
    /// <summary>Uses 34 pixel rows and 12 pixel horizontal padding.</summary>
    Default,
    /// <summary>Uses 28 pixel rows, 13 pixel text and 8 pixel horizontal padding.</summary>
    Compact,
    /// <summary>Uses 42 pixel rows and 14 pixel horizontal padding.</summary>
    Comfortable
}
