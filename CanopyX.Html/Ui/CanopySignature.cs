using System;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a signature pad (docs/ui-signature.md): drawing or a typed name, with undo, clear, colours and downloads.</summary>
/// <remarks>The pad needs the runtime. This builder emits no assets or executable code.</remarks>
public sealed class CanopySignature {
    /// <summary>Creates a pad with a page-unique identity and a plain text accessible name.</summary>
    public CanopySignature(string id, string label, CanopySignatureOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
        Options = options ?? new CanopySignatureOptions();
    }

    /// <summary>Gets the root identity.</summary>
    public string Id { get; }
    /// <summary>Gets the pad's accessible name.</summary>
    public string Label { get; }
    /// <summary>Gets the typed options.</summary>
    public CanopySignatureOptions Options { get; }

    /// <summary>Renders the pad's root with encoded settings.</summary>
    /// <exception cref="ArgumentException">A colour or the download name holds characters a CSS colour or a file name cannot.</exception>
    public string ToHtmlFragment() {
        Colour(Options.Ink); Colour(Options.Background);
        if (Options.DownloadName != null && (Options.DownloadName.Length == 0 || Options.DownloadName.IndexOfAny(new[] { '/', '\\', ':', '"', '<', '>', '|', '?', '*' }) >= 0))
            throw new ArgumentException("The download name is a plain file name without extension.");
        var html = new StringBuilder("<div");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-signature-host\" data-cx-signature");
        UiHtml.Attribute(html, "data-label", Label);
        UiHtml.Attribute(html, "data-name", Options.Name);
        if (Options.SubmitPng) UiHtml.Attribute(html, "data-format", "png");
        UiHtml.Attribute(html, "data-ink", Options.Ink);
        UiHtml.Attribute(html, "data-background", Options.Background);
        if (Options.Colours) UiHtml.Attribute(html, "data-colours", "true");
        UiHtml.Attribute(html, "data-download", Options.DownloadName);
        if (Options.ReadOnly) UiHtml.Attribute(html, "data-readonly", "true");
        return html.Append("></div>").ToString();
    }

    private static void Colour(string? value) {
        if (value == null) return;
        foreach (var c in value) if (!(char.IsLetterOrDigit(c) || c == '#' || c == '(' || c == ')' || c == ',' || c == '.' || c == '%' || c == ' ' || c == '-'))
            throw new ArgumentException("A colour is a CSS colour such as #1d4ed8 or rgb(0, 0, 0).");
    }
}
