namespace CanopyX;

/// <summary>The symbol a matrix state draws in its cells and its legend, so no state is told apart by colour alone.</summary>
public enum CanopyMatrixSymbol {
    /// <summary>A check mark, for passing or healthy.</summary>
    Check = 0,
    /// <summary>A cross, for failing.</summary>
    Cross,
    /// <summary>A triangle with an exclamation mark, for a warning.</summary>
    Warning,
    /// <summary>The letter i in a circle, for information.</summary>
    Info,
    /// <summary>A filled dot.</summary>
    Dot,
    /// <summary>A short dash, for not applicable or not collected.</summary>
    Dash,
    /// <summary>A question mark, for unknown.</summary>
    Question,
    /// <summary>A clock, for pending or stale.</summary>
    Clock,
    /// <summary>Two bars, for paused or suppressed.</summary>
    Pause
}
