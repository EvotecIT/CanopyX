namespace CanopyX;

/// <summary>What the cells of a square matrix whose row and column are the same item show.</summary>
public enum CanopyMatrixDiagonal {
    /// <summary>The self cell is drawn as "same item", carries no state and counts in no total (the default).</summary>
    Self = 0,
    /// <summary>The self cell is an ordinary cell, with its state and value, and counts like the others.</summary>
    Data
}
