// A signature pad anywhere on a page (docs/ui-signature.md): the shared pad, with an optional pen colour button, background and
// PNG and SVG downloads. With a name it writes the answer into a hidden input for forms: the SVG document, or the PNG data URI
// with data-format="png".
UI_IMPL.signature = (root, options = {}, signal) => {
  const labels = UI_TOOLS.labels(options.labels), data = root.dataset;
  const name = options.name ?? data.name, format = options.format ?? data.format ?? 'svg';
  if (!['svg', 'png'].includes(format)) throw new Error('CanopyX: a signature submits svg or png.');
  let hidden = null;
  if (name) hidden = root.querySelector('input[type="hidden"][name="' + CSS.escape(name) + '"]');
  // An input the signature made leaves with it, so a destroyed pad submits nothing; a host's own input stays.
  const made = !!name && !hidden;
  if (made) hidden = root.appendChild(Object.assign(h('input'), { type: 'hidden', name }));
  const write = value => { if (hidden) hidden.value = value ? value[format] : ''; };
  root.classList.add('cx-signature-host'); root.dataset.cxPart = 'signature-host';
  const pad = signaturePad({ signal, readOnly: options.readOnly ?? data.readonly === 'true', value: options.value, ink: options.ink ?? data.ink, background: options.background ?? data.background,
    colours: options.colours ?? data.colours === 'true', download: options.download ?? (data.download === 'true' || data.download || false),
    labels: { pad: options.label ?? data.label ?? labels.signaturePad, undo: labels.signatureUndo, clear: labels.signatureClear, type: labels.signatureType, draw: labels.signatureDraw,
      typed: labels.signatureTyped, colour: labels.signatureColour, png: labels.signatureDownloadPng, svg: labels.signatureDownloadSvg },
    onChange: value => {
      write(value);
      options.onChange?.(value);
      UI_TOOLS.emit(root, 'signature', 'change', { value });
    } });
  root.append(pad.element); write(pad.getValue());
  // A form reset brings back the signature the pad started with; the hidden input's value is not reset by the browser.
  const initial = pad.getValue(), form = hidden?.form || root.closest('form');
  form?.addEventListener('reset', event => setTimeout(() => {
    // A host that cancels the reset keeps the form as it is, the signature too.
    if (signal?.aborted || event.defaultPrevented) return;
    pad.setValue(initial); write(initial); options.onChange?.(initial); UI_TOOLS.emit(root, 'signature', 'change', { value: initial });
  }), { signal });
  signal?.addEventListener('abort', () => { pad.destroy(); pad.element.remove(); if (made) hidden.remove(); }, { once: true });
  return { getState: () => ({ value: pad.getValue() }), clear: () => pad.clear(), select: value => { pad.setValue(value); write(pad.getValue()); }, focus: pad.focus };
};
