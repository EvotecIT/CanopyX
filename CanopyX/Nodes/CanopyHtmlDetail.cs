using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A detail row that shows host markup, for example a component rendered by another library.
/// </summary>
/// <remarks>
/// The markup is trusted: the runtime inserts it as HTML without sanitising it. Hosts must encode any user-supplied
/// text they put into it. Cells, badges, and every other text field are always inserted as text.
/// </remarks>
public sealed class CanopyHtmlDetail : CanopyDetail {
    /// <summary>Creates an HTML detail.</summary>
    /// <param name="html">The trusted markup.</param>
    /// <exception cref="ArgumentNullException"><paramref name="html"/> is null.</exception>
    public CanopyHtmlDetail(string html) {
        Html = html ?? throw new ArgumentNullException(nameof(html));
    }

    /// <summary>Gets the trusted markup.</summary>
    public string Html { get; }

    internal override string Type => "html";


    internal override void WriteContent(CanopyJsonWriter writer) {
        writer.Property("html", Html);
    }
}
