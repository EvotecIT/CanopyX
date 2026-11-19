# Signature pad

A signature anywhere on a page: drawing with a mouse, pen or finger, or a typed name for readers who cannot draw. It shares
its pad with the [flow signature field](flow-inputs.md#signatures) and adds a pen colour, a background, PNG and SVG downloads
and a hidden form input. It ships in the lazy `ui-signature` part.

```csharp
using CanopyX.Html.Ui;

string fragment = new CanopySignature("approval", "Signature of the change owner", new CanopySignatureOptions {
    Name = "signature",          // a hidden input with the SVG document (SubmitPng = true: the PNG data URI)
    Ink = "#1d4ed8",             // the pen colour; null draws in the text colour and saves black ink
    Background = "#fffbe6",      // painted in the pad and in both images; null keeps them transparent
    Colours = true,              // a pen colour button
    DownloadName = "approval"    // Download PNG and Download SVG buttons
}).ToHtmlFragment();
```

```javascript
const pad = CanopyX.signature('#approval', { onChange: value => save(value?.svg) });
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
