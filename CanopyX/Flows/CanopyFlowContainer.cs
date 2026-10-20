namespace CanopyX;

/// <summary>Where a flow opens (<see cref="CanopyFlow.Container"/>).</summary>
public enum CanopyFlowContainer {
    /// <summary>In the page, at its natural height. The default.</summary>
    Inline,

    /// <summary>In a modal dialog a launch button opens; full screen on phones.</summary>
    Dialog,

    /// <summary>In a modal drawer along the inline end of the window, which a launch button opens; full screen on phones.</summary>
    Drawer
}