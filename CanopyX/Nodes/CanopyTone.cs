namespace CanopyX;

/// <summary>
/// Semantic colour of a cell or badge. The theme maps each tone to a colour, so hosts never pick colours directly.
/// </summary>
public enum CanopyTone {
    /// <summary>No tone; the text uses the normal colour.</summary>
    None = 0,

    /// <summary>A quiet, uncoloured emphasis, for example a count badge.</summary>
    Neutral,

    /// <summary>Informational.</summary>
    Info,

    /// <summary>Good or passing.</summary>
    Success,

    /// <summary>Needs attention.</summary>
    Warning,

    /// <summary>Failing, critical, or destructive.</summary>
    Danger,

    /// <summary>De-emphasised text, for example "not collected".</summary>
    Muted
}
