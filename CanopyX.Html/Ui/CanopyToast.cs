namespace CanopyX.Html.Ui;

/// <summary>A toast written into a notification region, for example a notice a report shows when it opens.</summary>
public sealed class CanopyToast {
    /// <summary>Creates a toast with a plain text message.</summary>
    public CanopyToast(string message) {
        Message = UiHtml.Text(message, nameof(message));
    }

    /// <summary>Gets the plain text message.</summary>
    public string Message { get; }
    /// <summary>Gets or sets an identity unique in the region, so script can update or close the toast. Null generates one at runtime.</summary>
    public string? Id { get; set; }
    /// <summary>Gets or sets the plain text title shown above the message.</summary>
    public string? Title { get; set; }
    /// <summary>Gets or sets the tone. <see cref="CanopyTone.None"/> shows an informational toast.</summary>
    public CanopyTone Tone { get; set; }
    /// <summary>Gets or sets how long the toast stays, in milliseconds, 0 to 600000; 0 keeps it. Null uses the region's timeout.</summary>
    public int? Timeout { get; set; }
}
