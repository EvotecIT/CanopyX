using System;
using System.Collections.Generic;

namespace CanopyX.Html;

/// <summary>
/// One HTML document that several CanopyX fragments are written into. Fragments written with inline assets and the same
/// <see cref="CanopyHtmlOptions.Document"/> embed each part once: every part of <see cref="CanopyHtmlAssets.Parts"/> a view needs
/// (the tree tools, export, filter editor, history, links and search parts) travels with the first fragment that needs it, and
/// the later fragments leave it out.
/// </summary>
/// <remarks>
/// <para>
/// The runtime finds a part's payload anywhere in the document by its marker, the payload script's type and version
/// (<c>script[type="application/x-canopyx-&lt;name&gt;"][data-cx-version="…"]</c>), so the views of a page share one payload.
/// Use one instance per output document, and only for markup that reaches that document: a fragment written and then
/// discarded may hold the only payload. The fragment that carries a payload must be in the page before a view that needs
/// the part mounts; a host that inserts fragments later (tabs, templates, injected HTML) inserts the first one first, or
/// gives each such fragment its own document. Without a document, every inline fragment carries its own payloads and stands alone.
/// </para>
/// <para>
/// A host that assembles a page itself calls <see cref="EmbedOnce(CanopyHtmlPart, string)"/> for the parts of
/// <see cref="CanopyHtmlAssets.GetRequiredParts(CanopyTreeView)"/>; parts are handled alike, so a new part needs no host code.
/// </para>
/// <para>
/// The instance is not thread-safe; write the fragments of one document from one thread.
/// </para>
/// </remarks>
public sealed class CanopyHtmlDocument {
    private readonly HashSet<string> _parts = new HashSet<string>(StringComparer.Ordinal);
    private readonly List<string> _order = new List<string>();

    /// <summary>Gets the markers of the parts already embedded in this document, in embedding order, as <c>name@version</c> (for example <c>tree-tools@0123456789abcdef</c>).</summary>
    public IReadOnlyCollection<string> EmbeddedParts => new List<string>(_order).AsReadOnly();

    /// <summary>Returns a part's payload markup the first time the document asks for it, and an empty string afterwards.</summary>
    /// <param name="part">The part, from <see cref="CanopyHtmlAssets.Parts"/>.</param>
    /// <returns><see cref="CanopyHtmlPart.Markup"/>, or an empty string when the document already carries the part.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="part"/> is null.</exception>
    public string EmbedOnce(CanopyHtmlPart part) => EmbedOnce(part, null);

    /// <summary>Returns a part's payload markup, marked with a Content Security Policy nonce, the first time the document asks for it, and an empty string afterwards.</summary>
    /// <param name="part">The part, from <see cref="CanopyHtmlAssets.Parts"/>.</param>
    /// <param name="nonce">The response's nonce, or null for none (see <see cref="CanopyHtmlPart.GetMarkup"/>).</param>
    /// <returns><see cref="CanopyHtmlPart.GetMarkup"/>, or an empty string when the document already carries the part.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="part"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="nonce"/> is not a valid nonce.</exception>
    public string EmbedOnce(CanopyHtmlPart part, string? nonce) {
        if (part == null) throw new ArgumentNullException(nameof(part));
        // An invalid nonce throws before the part counts as embedded.
        CanopyContentSecurity.Attribute(nonce);
        return Claim(part.Name, part.Version) ? part.GetMarkup(nonce) : string.Empty;
    }

    /// <summary>Returns true when the part is not yet in the document, and records it as embedded.</summary>
    internal bool Claim(string name, string version) {
        var marker = name + "@" + version;
        if (!_parts.Add(marker)) return false;
        _order.Add(marker);
        return true;
    }
}