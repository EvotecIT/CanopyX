using System;
using System.Collections.Generic;

namespace CanopyX.Html;

/// <summary>
/// One HTML document that several CanopyX fragments are written into. Fragments written with inline assets and the same
/// <see cref="CanopyHtmlOptions.Document"/> embed each shared part once: the tree tools part, the grid export part, the filter editor
/// and the history presenters travel with the first fragment that needs them, and the later fragments leave them out.
/// </summary>
/// <remarks>
/// <para>
/// The runtime finds a part's payload anywhere in the document by its marker, the payload script's type and version
/// (<c>script[type="application/x-canopyx-tree-tools"][data-cx-version="…"]</c>, and likewise for <c>export</c>,
/// <c>filter-editor</c> and <c>history</c>), so the views of a page share one payload. Use one instance per output
/// document, and only for markup that reaches that document: a fragment written and then discarded may hold the only payload.
/// The fragment that carries a payload must be in the page before a view that needs the part mounts; a host that inserts
/// fragments later (tabs, templates, injected HTML) inserts the first one first, or gives each such fragment its own document.
/// Without a document, every inline fragment carries its own payloads and stands alone.
/// </para>
/// <para>
/// The instance is not thread-safe; write the fragments of one document from one thread.
/// </para>
/// </remarks>
public sealed class CanopyHtmlDocument {
    private readonly HashSet<string> _parts = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>Gets the markers of the parts already embedded in this document, as <c>name@version</c> (for example <c>tree-tools@0123456789abcdef</c>).</summary>
    public IReadOnlyCollection<string> EmbeddedParts => new List<string>(_parts).AsReadOnly();

    /// <summary>Returns true when the part is not yet in the document, and records it as embedded.</summary>
    internal bool Claim(string name, string version) => _parts.Add(name + "@" + version);
}
