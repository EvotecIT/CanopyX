  // ---------- the signature pad, shared by the flow-signature and ui-signature parts (docs/ui-signature.md) ----------
  // A pad takes pointer strokes (mouse, pen or touch) and smooths them into quadratic curves through the midpoints of the
  // sampled points; Undo removes the last stroke and Clear all of them. A reader who cannot draw types their name instead,
  // which the keyboard reaches. The answer is { svg, png }: the strokes (or the typed name) in the pen colour on the background
  // (transparent unless set) as an SVG document, and the same picture as a PNG data URI at twice the pad's size.
  const SIGNATURE_HEIGHT = 160, SIGNATURE_FACE = "'Segoe Script','Brush Script MT','Snell Roundhand',cursive";
  const signatureFont = size => "italic " + size + "px " + SIGNATURE_FACE;
  const signatureColour = (value, fallback) => typeof value === "string" && value && globalThis.CSS?.supports?.("color", value) ? value : fallback;
  /** The font size that fits a typed name inside the pad, 36 px at most: the preview, the SVG and the PNG all use it. */
  function signatureSize(typed, width) {
    const measure = h("canvas").getContext("2d");
    measure.font = signatureFont(36);
    const room = Math.max(1, width - 32), needed = measure.measureText(typed).width;
    return needed > room ? Math.max(8, Math.floor(36 * room / needed)) : 36;
  }
  const signatureNumber = value => Math.round(value * 10) / 10;
  /** A stroke as SVG path data: a dot for a single point, otherwise quadratic curves through the midpoints. */
  function signaturePath(points) {
    const [first] = points;
    if (points.length === 1) return "M" + signatureNumber(first.x) + " " + signatureNumber(first.y) + "l0.1 0";
    let data = "M" + signatureNumber(first.x) + " " + signatureNumber(first.y);
    for (let at = 1; at < points.length - 1; at++) {
      const point = points[at], next = points[at + 1];
      data += "Q" + signatureNumber(point.x) + " " + signatureNumber(point.y) + " " + signatureNumber((point.x + next.x) / 2) + " " + signatureNumber((point.y + next.y) / 2);
    }
    const last = points.at(-1);
    return data + "L" + signatureNumber(last.x) + " " + signatureNumber(last.y);
  }
  const signatureEscape = text => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function signatureDraw(context, strokes, typed, ink, width, background) {
    if (background) { context.fillStyle = background; context.fillRect(0, 0, width, SIGNATURE_HEIGHT); }
    context.strokeStyle = context.fillStyle = ink; context.lineWidth = 2.5; context.lineCap = context.lineJoin = "round";
    if (typed) { context.font = signatureFont(signatureSize(typed, width)); context.fillText(typed, 16, SIGNATURE_HEIGHT * 0.62); return; }
    for (const stroke of strokes) context.stroke(new Path2D(signaturePath(stroke)));
  }
  /** The answer of a drawing or a typed name: an SVG document and a PNG data URI of the same picture. */
  function signatureValue(width, strokes, typed, ink = "#000", background = null) {
    const size = typed ? signatureSize(typed, width) : 36, colour = signatureEscape(ink);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + SIGNATURE_HEIGHT + '" viewBox="0 0 ' + width + " " + SIGNATURE_HEIGHT + '">' +
      (background ? '<rect width="100%" height="100%" fill="' + signatureEscape(background) + '"/>' : "") +
      (typed ? '<text x="16" y="' + (SIGNATURE_HEIGHT * 0.62) + '" fill="' + colour + '" font-family="' + signatureEscape(SIGNATURE_FACE) + '" font-style="italic" font-size="' + size + '">' + signatureEscape(typed) + "</text>"
        : '<g fill="none" stroke="' + colour + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + strokes.map(points => '<path d="' + signaturePath(points) + '"/>').join("") + "</g>") + "</svg>";
    const canvas = h("canvas"), scale = 2, context = canvas.getContext("2d");
    canvas.width = width * scale; canvas.height = SIGNATURE_HEIGHT * scale;
    context.scale(scale, scale);
    signatureDraw(context, strokes, typed, ink, width, background);
    return { svg, png: canvas.toDataURL("image/png") };
  }
  const signatureFits = value => value !== null && typeof value === "object" && Object.keys(value).length === 2 && typeof value.svg === "string" && typeof value.png === "string" &&
    value.svg.startsWith("<svg ") && value.svg.endsWith("</svg>") && value.png.startsWith("data:image/png;base64,") && value.svg.length + value.png.length <= 1000000;

  /**
   * Builds a pad: { element, focus(), getValue(), setValue(value), clear(), destroy() }. Settings: labels (pad, undo, clear, type,
   * draw, typed, colour, png, svg), readOnly, value, ink and background (CSS colours; ink defaults to black in the answer and to the
   * text colour on screen), colours (a pen colour button), download (PNG and SVG buttons; a text names the files), classes
   * (button, link, input) and onChange(value).
   */
  function signaturePad(settings) {
    const labels = settings.labels, classes = settings.classes || {}, readOnly = !!settings.readOnly, signal = settings.signal;
    const group = h("div", "cx-signature"), pad = h("canvas", "cx-signature-pad"), tools = h("div", "cx-signature-tools");
    const button = (text, part, kind = "button") => { const element = h("button", "cx-signature-" + kind + (classes[kind] ? " " + classes[kind] : "")); element.type = "button"; element.dataset.cxPart = part; setText(element, text); return element; };
    const undo = button(labels.undo, "undo"), clear = button(labels.clear, "clear"), mode = button(labels.type, "mode", "link");
    const typedField = h("label", "cx-signature-typed"), typedText = h("span"), typedInput = h("input", "cx-signature-input" + (classes.input ? " " + classes.input : ""));
    let ink = signatureColour(settings.ink, null), background = signatureColour(settings.background, null);
    group.setAttribute("role", "group"); group.dataset.cxPart = "signature";
    pad.setAttribute("role", "img"); pad.setAttribute("aria-label", labels.pad); pad.dataset.cxPart = "signature-pad";
    if (background) pad.style.background = background;
    setText(typedText, labels.typed);
    typedInput.type = "text"; typedInput.autocomplete = "name"; typedInput.maxLength = 120; typedInput.disabled = readOnly;
    typedField.append(typedText, typedInput); typedField.hidden = true;
    tools.append(undo, clear, mode);
    let colourInput = null, downloads = [];
    if (settings.colours && !readOnly) {
      const field = h("label", "cx-signature-colour"), text = h("span", "cx-visually-hidden");
      colourInput = h("input"); colourInput.type = "color"; colourInput.dataset.cxPart = "colour"; setText(text, labels.colour);
      colourInput.value = /^#[0-9a-f]{6}$/i.test(ink || "") ? ink : "#000000"; colourInput.title = labels.colour;
      // A stored picture has no strokes to recolour, so it stays as it is until the reader draws or types.
      colourInput.addEventListener("input", () => { ink = colourInput.value; if (strokes.length || (typing && typedInput.value.trim())) commit(); else paint(); }, { signal });
      field.append(text, colourInput); tools.append(field);
    }
    if (settings.download) {
      const name = typeof settings.download === "string" ? settings.download : "signature";
      downloads = [["png", labels.png], ["svg", labels.svg]].map(([kind, text]) => {
        const element = button(text, "download-" + kind);
        element.addEventListener("click", () => {
          if (!value) return;
          const link = h("a"); link.download = name + "." + kind;
          link.href = kind === "png" ? value.png : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(value.svg);
          link.click();
        }, { signal });
        tools.append(element); return element;
      });
    }
    group.append(pad, typedField, tools);
    let strokes = [], current = null, typing = false, value = signatureFits(settings.value) ? settings.value : null, width = 0, stored = null;
    const shownInk = () => ink || getComputedStyle(pad).color;
    // A stored answer shows as its picture until the reader draws or types a new one.
    const show = picture => { stored = null; if (picture?.png) { stored = new Image(); stored.onload = () => paint(); stored.src = picture.png; } };
    show(value);

    function paint() {
      // Layout pixels, which ancestor transforms do not change; a fresh canvas is 300 by 150, so both sides are checked.
      const ratio = globalThis.devicePixelRatio || 1;
      width = Math.max(1, Math.round(pad.offsetWidth || pad.getBoundingClientRect().width));
      if (pad.width !== Math.round(width * ratio) || pad.height !== Math.round(SIGNATURE_HEIGHT * ratio)) { pad.width = Math.round(width * ratio); pad.height = Math.round(SIGNATURE_HEIGHT * ratio); }
      const draw = pad.getContext("2d");
      draw.setTransform(ratio, 0, 0, ratio, 0, 0); draw.clearRect(0, 0, width, SIGNATURE_HEIGHT);
      // A replacement stroke in progress draws over a blank pad, so the reader sees where they sign before releasing the pointer.
      if (stored && !strokes.length && !current && !typing) draw.drawImage(stored, 0, 0, Math.min(width, stored.naturalWidth / 2 || width), SIGNATURE_HEIGHT);
      else signatureDraw(draw, current ? [...strokes, current] : strokes, typing ? typedInput.value.trim() : "", shownInk(), width);
      undo.disabled = readOnly || typing || !strokes.length;
      clear.disabled = readOnly || !value;
      for (const element of downloads) element.disabled = !value;
      setText(mode, typing ? labels.draw : labels.type);
      mode.hidden = readOnly;
    }
    function commit() {
      const typed = typing ? typedInput.value.trim() : "";
      // Strokes keep the coordinates they were drawn at: a pad that has since narrowed (a rotated phone) exports wide enough for all of them.
      const reach = strokes.reduce((most, stroke) => stroke.reduce((far, point) => Math.max(far, point.x), most), 0);
      const next = typed || strokes.length ? signatureValue(Math.max(width, Math.ceil(reach) + 8), strokes, typed, ink || "#000", background) : null;
      // A value the pad could not load back is never published: the stroke that made it too large is taken back.
      // The stored picture stays until a replacement is accepted, so a refused stroke leaves the earlier signature showing.
      if (next && !signatureFits(next) && strokes.length) { strokes.pop(); paint(); return; }
      stored = null; value = next;
      paint(); settings.onChange?.(value);
    }
    // The pointer is read in the pad's own drawing units, so a scaled ancestor does not move the ink away from the pointer.
    const point = event => { const rect = pad.getBoundingClientRect(); return { x: (event.clientX - rect.left) * width / (rect.width || width), y: (event.clientY - rect.top) * SIGNATURE_HEIGHT / (rect.height || SIGNATURE_HEIGHT) }; };
    pad.addEventListener("pointerdown", event => {
      if (readOnly || typing || event.button > 0) return;
      event.preventDefault(); pad.setPointerCapture(event.pointerId);
      current = [point(event)]; current.pointer = event.pointerId; paint();
    }, { signal });
    pad.addEventListener("pointermove", event => {
      if (!current || current.pointer !== event.pointerId) return;
      // Coalesced events keep fast pen strokes smooth where the browser offers them.
      for (const sample of event.getCoalescedEvents?.() || [event]) current.push(point(sample));
      paint();
    }, { signal });
    pad.addEventListener("pointerup", event => { if (current?.pointer === event.pointerId) { strokes.push(current); current = null; commit(); } }, { signal });
    pad.addEventListener("pointercancel", event => { if (current?.pointer === event.pointerId) { current = null; paint(); } }, { signal });
    undo.addEventListener("click", () => { strokes.pop(); commit(); }, { signal });
    clear.addEventListener("click", () => { strokes = []; current = null; typedInput.value = ""; commit(); (typing ? typedInput : mode).focus(); }, { signal });
    mode.addEventListener("click", () => {
      typing = !typing; typedField.hidden = !typing; strokes = []; current = null; typedInput.value = ""; commit();
      if (typing) typedInput.focus();
    }, { signal });
    typedInput.addEventListener("input", event => { event.stopPropagation(); commit(); }, { signal });
    typedInput.addEventListener("change", event => event.stopPropagation(), { signal });
    const resize = new ResizeObserver(() => paint());
    resize.observe(pad);
    signal?.addEventListener("abort", () => resize.disconnect(), { once: true });
    return {
      element: group, pad, focus: () => (typing ? typedInput : mode.hidden ? pad : mode).focus(), getValue: () => value,
      setValue: next => { if (next !== null && !signatureFits(next)) throw new Error("CanopyX: a signature is { svg, png }."); strokes = []; current = null; typing = false; typedField.hidden = true; typedInput.value = ""; value = next; show(next); paint(); },
      clear: () => { strokes = []; current = null; typedInput.value = ""; commit(); },
      destroy: () => { resize.disconnect(); strokes = []; }
    };
  }
