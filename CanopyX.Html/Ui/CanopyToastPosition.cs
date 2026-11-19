namespace CanopyX.Html.Ui;

/// <summary>The corner or edge of the viewport where a notification region shows its toasts. Start and end follow the page direction.</summary>
public enum CanopyToastPosition {
    /// <summary>The bottom corner on the end side. The default.</summary>
    BottomEnd,
    /// <summary>The bottom corner on the start side.</summary>
    BottomStart,
    /// <summary>The middle of the bottom edge.</summary>
    BottomCenter,
    /// <summary>The top corner on the end side.</summary>
    TopEnd,
    /// <summary>The top corner on the start side.</summary>
    TopStart,
    /// <summary>The middle of the top edge.</summary>
    TopCenter
}
