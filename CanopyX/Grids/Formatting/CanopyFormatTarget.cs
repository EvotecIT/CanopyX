namespace CanopyX;

/// <summary>What a formatting rule paints when it matches a row.</summary>
public enum CanopyFormatTarget {
    /// <summary>The cell of the rule's column.</summary>
    Cell = 0,
    /// <summary>The whole row: a tint and an accent, with the rule's icon and cues in its first cell.</summary>
    Row,
    /// <summary>The cells of the columns the rule names.</summary>
    Columns
}
