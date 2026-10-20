using System;

namespace CanopyX.Data;

/// <summary>A link of a saved answer's result panel (<see cref="CanopyFlowAnswer.Links"/>).</summary>
public sealed class CanopyFlowLink {
    /// <summary>Creates a link.</summary>
    /// <param name="label">The text: visible text.</param>
    /// <param name="href">An <c>http</c>, <c>https</c> or <c>mailto</c> address, or a path on the page's own origin. The browser drops any other.</param>
    /// <exception cref="ArgumentException"><paramref name="label"/> has no visible text, or <paramref name="href"/> is empty or longer than 2,048 characters.</exception>
    public CanopyFlowLink(string label, string href) {
        Label = CanopyFlowText.Require(label, nameof(label));
        if (string.IsNullOrEmpty(href) || href.Length > 2048) throw new ArgumentException("A link needs an address of at most 2048 characters.", nameof(href));
        Href = href;
    }

    /// <summary>Gets the text.</summary>
    public string Label { get; }

    /// <summary>Gets the address.</summary>
    public string Href { get; }
}