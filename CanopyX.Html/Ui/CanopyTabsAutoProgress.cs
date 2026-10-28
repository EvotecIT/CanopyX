namespace CanopyX.Html.Ui;

/// <summary>Configures optional automatic tab progression with a visible Pause/Play control.</summary>
/// <remarks>Manual selection stops progression. Reduced motion disables it, including after Play.</remarks>
public sealed class CanopyTabsAutoProgress {
    /// <summary>Gets or sets the positive interval in milliseconds between automatic selections. Defaults to 5000.</summary>
    public int Interval { get; set; } = 5000;

    /// <summary>Gets or sets whether hovering over the tab set suspends its interval. Defaults to true.</summary>
    public bool PauseOnHover { get; set; } = true;

    /// <summary>Gets or sets whether focus inside the tab set suspends its interval. Defaults to true.</summary>
    public bool PauseOnFocus { get; set; } = true;
}
