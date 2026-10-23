namespace CanopyX;

/// <summary>Chooses shared row spacing. An explicitly assigned row height takes precedence.</summary>
public enum CanopyGridDensity {
    /// <summary>Uses comfortable spacing: 40 pixel rows and 12 pixel horizontal padding.</summary>
    Default,
    /// <summary>Uses 32 pixel rows, 13 pixel text and 8 pixel horizontal padding.</summary>
    Compact,
    /// <summary>Uses 40 pixel rows and 12 pixel horizontal padding.</summary>
    Comfortable
}
