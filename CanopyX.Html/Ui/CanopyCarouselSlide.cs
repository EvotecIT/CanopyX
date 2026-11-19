namespace CanopyX.Html.Ui;

/// <summary>A carousel slide: trusted content and an optional name for its picker button.</summary>
public sealed class CanopyCarouselSlide {
    /// <summary>Creates a slide with trusted HTML content.</summary>
    public CanopyCarouselSlide(string contentHtml) {
        ContentHtml = contentHtml ?? throw new System.ArgumentNullException(nameof(contentHtml));
    }

    /// <summary>Gets the trusted HTML, inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string ContentHtml { get; }
    /// <summary>Gets or sets the plain text name of the slide and its picker button. Null uses the localized "Slide 2 of 5".</summary>
    public string? Label { get; set; }
    /// <summary>Gets or sets a plain text caption shown over the slide or under it (<see cref="CanopyCarouselOptions.Captions"/>), also without the runtime.</summary>
    public string? Caption { get; set; }
}
