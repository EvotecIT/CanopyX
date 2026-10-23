namespace CanopyX.Html.Ui;

/// <summary>How keyboard focus activates tabs.</summary>
public enum CanopyTabActivation {
    /// <summary>Selection follows focus.</summary>
    Automatic,
    /// <summary>Enter or Space activates the focused tab.</summary>
    Manual,
    /// <summary>The runtime chooses manual activation for deferred panels or a beforeChange callback, and automatic activation otherwise.</summary>
    Auto,
}
