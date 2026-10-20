namespace CanopyX;

/// <summary>The stepper a flow draws (<see cref="CanopyFlow.Orientation"/>).</summary>
public enum CanopyFlowOrientation {
    /// <summary>The horizontal stepper for up to six visible steps whose titles fit the width, the vertical one otherwise. The default.</summary>
    Auto,

    /// <summary>Numbered markers in a rail above the form.</summary>
    Horizontal,

    /// <summary>A rail on the inline start side, for long flows.</summary>
    Vertical
}