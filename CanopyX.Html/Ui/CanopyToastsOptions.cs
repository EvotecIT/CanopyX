namespace CanopyX.Html.Ui;

/// <summary>Typed notification region options. Toast actions and callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopyToastsOptions {
    /// <summary>Gets or sets where the toasts show.</summary>
    public CanopyToastPosition Position { get; set; }
    /// <summary>Gets or sets how many toasts show at once, 1 to 10; the rest wait in order. Default 3.</summary>
    public int Max { get; set; } = 3;
    /// <summary>Gets or sets the default time a toast stays, in milliseconds, 0 to 600000. 0 keeps toasts until they are dismissed. Default 5000.</summary>
    /// <remarks>Danger toasts stay until dismissed unless they name their own timeout. The timeout pauses while the pointer or focus is on the region.</remarks>
    public int Timeout { get; set; } = 5000;
    /// <summary>Gets or sets the region's accessible name. Null uses the localized label.</summary>
    public string? Label { get; set; }
}
