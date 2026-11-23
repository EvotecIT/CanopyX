# Signature pad

A signature anywhere on a page: drawing with a mouse, pen or finger, or a typed name for readers who cannot draw. It shares
its pad with the [flow signature field](flow-inputs.md#signatures) and adds a pen colour choice, PNG and SVG downloads and a
hidden form input. The pad takes its colours from the theme. It ships in the lazy `ui-signature` part.

```csharp
using CanopyX.Html.Ui;

string fragment = new CanopySignature("approval", "Signature of the change owner", new CanopySignatureOptions {
    Name = "signature",          // a hidden input with the SVG document (SubmitPng = true: the PNG data URI)
    Colours = true,              // a pen colour button
    DownloadName = "approval"    // Download PNG and Download SVG buttons
}).ToHtmlFragment();
```

The page mounts that markup by itself, with the settings it carries. Listen for its change event and reach it through the
controller; options passed to `CanopyX.signature()` apply only to an element the page has not mounted (one without
`data-cx-signature`), such as an empty `<div>` the host fills.

```javascript
document.getElementById('approval').addEventListener('cx-signature:change', event => save(event.detail.value?.svg));
const pad = CanopyX.signature('#approval');
await pad.ready;
pad.getState();   // { value: { svg: '<svg …>', png: 'data:image/png;base64,…' } }
pad.clear();
```

Strokes are smoothed into curves through the midpoints of the sampled points, Undo removes the last stroke and Clear the whole
signature. "Type instead" switches to a text box and renders the name in a script face, shrunk to fit the pad; the keyboard
reaches every control. The answer is `{ svg, png }`: the same picture as an SVG document and as a PNG at twice the pad's size.
Strokes drawn before the pad narrowed (a rotated phone) stay whole in both. `select(value)` shows a stored signature until
it is cleared. The root fires `cx-signature:change` with `{ value }`.

The built-in locale packs translate `signaturePad`, `signatureUndo`, `signatureClear`, `signatureType`, `signatureDraw`,
`signatureTyped`, `signatureColour`, `signatureDownloadPng` and `signatureDownloadSvg`.
