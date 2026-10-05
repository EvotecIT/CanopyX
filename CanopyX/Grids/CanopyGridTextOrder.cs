namespace CanopyX;

/// <summary>Deterministic text ordering shared by a grid and its host query engine.</summary>
public enum CanopyGridTextOrder {
    /// <summary>Compare UTF-16 code units without culture-dependent collation.</summary>
    Ordinal,
    /// <summary>Compare after the protocol's frozen single-code-unit case folding.</summary>
    FoldedOrdinal,
    /// <summary>Compare ASCII digit runs by magnitude and other code units ordinally.</summary>
    Natural,
    /// <summary>Combine natural digit ordering with the protocol's frozen case folding.</summary>
    FoldedNatural
}
