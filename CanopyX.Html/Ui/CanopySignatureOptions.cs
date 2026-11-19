namespace CanopyX.Html.Ui;

/// <summary>Typed signature pad options. Change callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopySignatureOptions {
    /// <summary>Gets or sets the form field name of a hidden input that holds the answer. Null writes no input.</summary>
    public string? Name { get; set; }
    /// <summary>Gets or sets whether the hidden input holds the PNG data URI instead of the SVG document.</summary>
    public bool SubmitPng { get; set; }
    /// <summary>Gets or sets the pen colour, a CSS colour. Null draws in the text colour and saves black ink.</summary>
    public string? Ink { get; set; }
    /// <summary>Gets or sets the background colour, a CSS colour, painted in the pad and in both images. Null keeps them transparent.</summary>
    public string? Background { get; set; }
    /// <summary>Gets or sets whether the reader can choose the pen colour.</summary>
    public bool Colours { get; set; }
    /// <summary>Gets or sets the file name, without extension, of PNG and SVG download buttons. Null shows no downloads.</summary>
    public string? DownloadName { get; set; }
    /// <summary>Gets or sets whether the pad only shows its value.</summary>
    public bool ReadOnly { get; set; }
}
