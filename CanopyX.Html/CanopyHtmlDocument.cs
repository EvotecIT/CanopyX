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
/// A part's script registers the part for the whole document when it runs, so the views of a page share one copy. Use one
/// instance per output document, and only for markup that reaches that document: a fragment written and then discarded may
/// hold the only copy. The fragment that carries a part must be in the page, and its script run, before a view that needs
/// the part mounts; a host that inserts fragments later (tabs, templates) inserts the first one first, or gives each such
/// fragment its own document. A part's script runs only where the browser runs scripts: markup parsed with the page or
/// inserted through <c>Range.createContextualFragment</c>, but not markup set through <c>innerHTML</c>, after which the runtime
/// looks for the part files instead. A part's stylesheet is an inert template; the runtime applies one copy of it in the
/// document's head, so removing the fragment that carried it keeps the rules for the other views. Without a document, every inline fragment carries its own parts and stands alone; on a page of such fragments the
/// first copy of a part registers, and the runtime removes the stylesheets of the others.
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

    /// <summary>Returns a part's markup the first time the document asks for it, and an empty string afterwards.</summary>
    /// <param name="part">The part, from <see cref="CanopyHtmlAssets.Parts"/>.</param>
    /// <returns><see cref="CanopyHtmlPart.Markup"/>, or an empty string when the document already carries the part.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="part"/> is null.</exception>
    public string EmbedOnce(CanopyHtmlPart part) => EmbedOnce(part, null);

    /// <summary>Returns a part's markup, marked with a Content Security Policy nonce, the first time the document asks for it, and an empty string afterwards.</summary>
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