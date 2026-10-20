namespace CanopyX.Data;

/// <summary>How a preview row's value reads (<see cref="CanopyFlowPreviewRow.Tone"/>).</summary>
public enum CanopyFlowTone {
    /// <summary>Plain. The default.</summary>
    Neutral,

    /// <summary>Informational.</summary>
    Info,

    /// <summary>Good news, such as something that will be created.</summary>
    Success,

    /// <summary>Worth a second look.</summary>
    Warning,

    /// <summary>Destructive or risky, such as something that will be removed.</summary>
    Danger
}