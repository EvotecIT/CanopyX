# Security

This page describes how CanopyX behaves under a strict Content Security Policy and Trusted Types, how it keeps host strings from becoming markup, what a host is responsible for when it hands CanopyX markup of its own, and how exports avoid spreadsheet formula injection.

The browser tests `tests/browser/specs/csp.spec.mjs` and `tests/browser/specs/xss.spec.mjs` cover each section, and `CanopyX.Tests/Html/ContentSecurityTests.cs` covers the C# writers.

## Content Security Policy

CanopyX works under a policy without `'unsafe-inline'` or `'unsafe-eval'`:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'; object-src 'none'; base-uri 'none'
```

The runtime never evaluates strings: there is no `eval`, no `Function` constructor and no string `setTimeout`. It sets dynamic styles (widths, positions, heights, the print outline's indent) through the style object (`element.style.width = …`), which a policy allows, and never writes a `style` attribute through markup or `setAttribute`.

Three kinds of element need the nonce, because a policy checks them:

| Element | Written by | How it gets the nonce |
| --- | --- | --- |
| The runtime `<script>` and `<style>` of a page with inline assets, or the `<script src>` and `<link rel="stylesheet">` of a page with external assets | `ToHtmlPage`, `SaveHtmlPage`, `SaveHtmlBundle` | `CanopyHtmlOptions.Nonce` |
| The `<style>` rule that gives a fragment its `Height` | `ToHtmlFragment` | `CanopyHtmlOptions.Nonce` (without a nonce the fragment keeps its `style` attribute) |
| The scripts and stylesheets of the optional parts (tree tools, export, filter editor, history, search, links), and a bundle's sidecar scripts | The runtime, when it loads them | The page nonce (below) |

The view document is a `<script type="application/json">` data block, and a part's inert payload is a `<script type="application/x-canopyx-…">` data block. A policy does not run or block data blocks, so they work under any policy.

### The page nonce

When the runtime loads a part from a file beside it, or a bundle's sidecar script, it gives the `<script>` or `<link>` element the first of:

1. the nonce a host set with `CanopyX.setNonce(nonce)`;
2. the nonce of the `<script>` element that loaded the runtime (a classic script; a module has no current script);
3. the nonce of a nonced `<script>` already on the page.

A part embedded in the page runs with the nonce of its own payload, which the C# writers mark with `CanopyHtmlOptions.Nonce`. When the page nonce is known (1 or 2), the runtime only takes a payload that carries it: a payload injected into the page without the response's nonce is never run, even under `'strict-dynamic'` or Trusted Types, and the runtime then loads the part from its file instead. Mark every payload with the response's nonce (`CanopyHtmlPart.GetMarkup(nonce)`), or the part does not load from the page.

So a page whose runtime script carries the nonce needs nothing else. A host that loads the ES module, or that inserts the runtime from its own code, calls `CanopyX.setNonce` before the first view mounts.

A nonce lets a script in whatever its address, so the addresses the runtime loads scripts from are part of what the host vouches for: the part files beside the runtime script (or below the page's base URL when the runtime is inline), and the `base` of a sidecar source in the view document. Keep `base-uri 'none'` (or `'self'`) in the policy, so injected markup cannot move the base URL.

### C# hosts

A nonce is new for every response. Write the markup per response with the response's nonce:

```csharp
var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(18));
response.Headers["Content-Security-Policy"] =
    $"default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'; object-src 'none'; base-uri 'none'";
var html = view.ToHtmlPage(new CanopyHtmlOptions { Nonce = nonce });
```

A host that caches the markup writes it once with a placeholder nonce, such as `Nonce = "CANOPYXNONCE"`, and replaces the placeholder per response; the example pages in `CanopyX.Examples/CspExamples.cs` work that way, and the browser test's server replaces the placeholder. `Nonce` accepts the CSP nonce grammar only (base64 or base64url characters with up to two trailing `=`), so a value can never break out of its attribute.

Fragments that share a `CanopyHtmlDocument` carry each part once; pass the same nonce to every fragment of the response. A host that assembles its own pages calls `CanopyHtmlPart.GetMarkup(nonce)` or `CanopyHtmlDocument.EmbedOnce(part, nonce)`, and puts the nonce on its own `<script>` and `<link>` elements for the runtime files.

### JavaScript hosts

```html
<link rel="stylesheet" href="/assets/canopyx-grid.css" nonce="{nonce}">
<script src="/assets/canopyx-grid.js" nonce="{nonce}" defer></script>
<script nonce="{nonce}">
  // Only needed when the runtime script cannot pass its own nonce on, for example with the ES module.
  CanopyX.setNonce("{nonce}");
</script>
```

With `'strict-dynamic'` in `script-src`, scripts the runtime inserts are allowed without a nonce, but the runtime still sets it, so the same page works with and without `'strict-dynamic'`.

### Out of scope

`CanopyStaticHtml` (the static outline for email, print and Word) writes inline `style` attributes on purpose: email clients and Word ignore stylesheets. It is meant for those destinations, not for a page under a strict policy; on such a page the live view prints its own outline, built as elements.

## Trusted Types

CanopyX supports `require-trusted-types-for 'script'`:

```text
Content-Security-Policy: …; require-trusted-types-for 'script'; trusted-types canopyx
```

The runtime creates one policy, named `canopyx`, on first use, and hands sinks values from it only where it must:

| Sink | Value | Where it comes from |
| --- | --- | --- |
| `script.textContent` | A part's script | The inert payload in the page for the part's version, and, when the page nonce is known, only a payload that carries it |
| `script.src` | A part file or a sidecar file | A file name beside the runtime or the bundle, resolved by the runtime |
| `innerHTML` | Host-trusted markup (below) | An `html` detail or a view icon, after the host's `sanitizeHtml` when there is one |

Everything else the runtime writes is built as elements and text: grid icons are created as SVG elements, and the print outline and `toOutline()` are built as a table and serialized. A page whose `trusted-types` directive does not list `canopyx` refuses the policy, and the runtime then hands the sinks plain strings, which an enforcing page rejects. Add `'allow-duplicates'` to `trusted-types` only if a page loads two copies of the runtime.

The `canopyx` policy passes its values through unchanged: the host vouches for the markup it declares trusted. A host that wants every `innerHTML` value to come from its own policy returns `TrustedHTML` from `sanitizeHtml` (below); the runtime then writes that value as it is and never asks the `canopyx` policy for HTML.

## The escaping model

Host strings are text. The runtime writes every label, cell value, column title, badge, tooltip (`title`), filter and search label, placeholder, detail table and property, record drawer field, menu entry and announcement through `textContent`, attributes through `setAttribute` or properties, and never through markup. That includes the strings a translation pack or `labels` supplies.

Links are the one place a host string becomes an address. The link presenter turns a cell into a link only for `http:`, `https:` and `mailto:` addresses, and for relative and `file:` addresses without another scheme; anything else, `javascript:`, `data:` and `vbscript:` among them, keeps its text without a link. An address with a control character (`java\nscript:`) is refused, and the scheme is checked on the parsed address, so leading spaces and mixed case (` JaVaScRiPt:`) do not hide it.

## Host renderers and host-trusted markup

Two features hand CanopyX markup or code from the host. Both are trusted input: CanopyX cannot tell safe markup from unsafe markup, and the host is responsible for what it passes.

- **Renderers** (`renderers`, `renderDetail`, plugin cell renderers, reporting toolbar content). A renderer gets a DOM element and fills it itself. CanopyX does not parse anything a renderer produces; whatever the renderer writes (with `textContent`, DOM methods, or its own `innerHTML`) is the host's code running with the host's privileges. Build content with DOM methods and `textContent`, and run any markup through a sanitiser first.
- **Host-trusted markup**: a detail of type `html` and the SVG icons of `view.icons`. The view document carries them as markup, and the runtime writes them with `innerHTML`. Never put user-supplied or data-derived strings into them unescaped. The `sanitizeHtml` option sees each value first:

```js
CanopyX.configure("files", {
  // kind is "detail" or "icon"; return a string, TrustedHTML from the host's own policy, or a Node.
  sanitizeHtml: (html, { kind }) => mySanitizer(html)
});
```

A sanitiser that returns a `DocumentFragment` or another node is inserted as it is, without parsing; one that returns `TrustedHTML` from the host's own policy is written without the `canopyx` policy. The print outline and `toOutline()` show an `html` detail as text, so markup never travels into a copy the host may email or store. The C# static outline does the same.

## Exports

**CSV and clipboard.** A text field that starts with `=`, `+`, `-` or `@` (after any spaces), with their full-width forms, or with a tab or carriage return, gets a leading apostrophe, so a spreadsheet shows it as text instead of running it as a formula. That covers column titles, the copied cell or row, every CSV export scope, and the indented tree column of a tree's CSV. Formatted numbers are text and are escaped too; a reporting export of raw values keeps numbers as numbers. Fields with the delimiter, a quote or a line break are quoted, with quotes doubled.

**File names.** A download is saved under a basename: path separators, reserved characters (`\ / : * ? " < > |`) and control characters become `_`, and a leading dot or space is replaced. A reporting export's `fileName` option is refused unless it is already a safe basename of at most 100 characters.

**Format providers** (`registerExportFormat`) are host code: CanopyX hands them the captured rows and saves the file they return under a basename. A provider that builds HTML, XLSX or PDF output escapes the values for its own format.
