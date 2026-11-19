  // ---------- the flow-signature part: signature fields, drawn or typed (docs/flow.md#signatures) ----------
  // A pad takes pointer strokes (mouse, pen or touch) and smooths them into quadratic curves through the midpoints of the
  // sampled points; Undo removes the last stroke and Clear all of them. A reader who cannot draw types their name instead,
  // which the keyboard reaches. The answer is { svg, png }: the strokes (or the typed name) as an SVG document in black ink on
  // a transparent background, and the same picture as a PNG data URI at twice the pad's size, so a host can store either.
  const FLOW_PART_LABELS = {
    flowSignaturePad: "Signature pad",
    flowSignatureClear: "Clear",
    flowSignatureUndo: "Undo",
    flowSignatureType: "Type instead",
    flowSignatureDraw: "Draw instead",
    flowSignatureTyped: "Type your full name",
    flowSigned: "Signed"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const SIGNATURE_HEIGHT = 160, SIGNATURE_INK = "#000", SIGNATURE_FACE = "'Segoe Script','Brush Script MT','Snell Roundhand',cursive";
  const signatureFont = size => "italic " + size + "px " + SIGNATURE_FACE;
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
  const signatureEscape = text => text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /** The answer of a drawing or a typed name: an SVG document and a PNG data URI of the same picture. */
  function signatureValue(width, strokes, typed) {
    const size = typed ? signatureSize(typed, width) : 36;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + SIGNATURE_HEIGHT + '" viewBox="0 0 ' + width + " " + SIGNATURE_HEIGHT + '">' +
      (typed ? '<text x="16" y="' + (SIGNATURE_HEIGHT * 0.62) + '" fill="' + SIGNATURE_INK + '" font-family="\'Segoe Script\',\'Brush Script MT\',\'Snell Roundhand\',cursive" font-style="italic" font-size="' + size + '">' + signatureEscape(typed) + "</text>"
        : '<g fill="none" stroke="' + SIGNATURE_INK + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + strokes.map(points => '<path d="' + signaturePath(points) + '"/>').join("") + "</g>") + "</svg>";
    const canvas = h("canvas"), scale = 2, context = canvas.getContext("2d");
    canvas.width = width * scale; canvas.height = SIGNATURE_HEIGHT * scale;
    context.scale(scale, scale);
    signatureDraw(context, strokes, typed, SIGNATURE_INK, width);
    return { svg, png: canvas.toDataURL("image/png") };
  }
  function signatureDraw(context, strokes, typed, ink, width) {
    context.strokeStyle = context.fillStyle = ink; context.lineWidth = 2.5; context.lineCap = context.lineJoin = "round";
    if (typed) { context.font = signatureFont(signatureSize(typed, width)); context.fillText(typed, 16, SIGNATURE_HEIGHT * 0.62); return; }
    for (const stroke of strokes) context.stroke(new Path2D(signaturePath(stroke)));
  }

  FLOW_HOST.signature = {
    fits: (field, value) => flowIs(value) && Object.keys(value).length === 2 && typeof value.svg === "string" && typeof value.png === "string" &&
      value.svg.startsWith("<svg ") && value.svg.endsWith("</svg>") && value.png.startsWith("data:image/png;base64,") && value.svg.length + value.png.length <= 1000000,
    input: (context, field, view) => flowSignatureInput(context, field, view.labels),
    display: view => view.labels.flowSigned
  };

  function flowSignatureInput(context, field, labels) {
    const group = h("div", "cx-flow-signature"), pad = h("canvas", "cx-flow-signature-pad"), tools = h("div", "cx-flow-signature-tools");
    const undo = h("button", "cx-flow-btn"), clear = h("button", "cx-flow-btn"), mode = h("button", "cx-flow-link");
    const typedField = h("label", "cx-flow-signature-typed"), typedText = h("span"), typedInput = h("input", "cx-flow-input");
    group.setAttribute("role", "group");
    pad.setAttribute("role", "img"); pad.setAttribute("aria-label", labels.flowSignaturePad); pad.dataset.cxPart = "signature-pad";
    for (const [button, text] of [[undo, labels.flowSignatureUndo], [clear, labels.flowSignatureClear]]) { button.type = "button"; setText(button, text); }
    mode.type = "button"; setText(typedText, labels.flowSignatureTyped);
    typedInput.type = "text"; typedInput.autocomplete = "name"; typedInput.maxLength = 120;
    typedField.append(typedText, typedInput); typedField.hidden = true;
    tools.append(undo, clear, mode);
    group.append(pad, typedField, tools);
    let strokes = [], current = null, typing = false, value = flowIs(context.value) ? context.value : null, width = 0, stored = null;
    const ink = () => getComputedStyle(pad).color;
    const changed = () => group.dispatchEvent(new Event("change", { bubbles: true }));
    // A stored answer (edit mode) shows as its picture until the reader draws or types a new one.
    if (value?.png) { stored = new Image(); stored.onload = () => paint(); stored.src = value.png; }

    function paint() {
      const rect = pad.getBoundingClientRect(), ratio = globalThis.devicePixelRatio || 1;
      width = Math.max(1, Math.round(rect.width));
      if (pad.width !== Math.round(width * ratio)) { pad.width = Math.round(width * ratio); pad.height = Math.round(SIGNATURE_HEIGHT * ratio); }
      const draw = pad.getContext("2d");
      draw.setTransform(ratio, 0, 0, ratio, 0, 0); draw.clearRect(0, 0, width, SIGNATURE_HEIGHT);
      if (stored && !strokes.length && !typing) draw.drawImage(stored, 0, 0, Math.min(width, stored.naturalWidth / 2 || width), SIGNATURE_HEIGHT);
      else signatureDraw(draw, current ? [...strokes, current] : strokes, typing ? typedInput.value.trim() : "", ink(), width);
      undo.disabled = context.readOnly || typing || !strokes.length;
      clear.disabled = context.readOnly || !value;
      setText(mode, typing ? labels.flowSignatureDraw : labels.flowSignatureType);
      mode.hidden = context.readOnly;
    }
    function commit() {
      const typed = typing ? typedInput.value.trim() : "";
      stored = null;
      // Strokes keep the coordinates they were drawn at: a pad that has since narrowed (a rotated phone) exports wide enough for all of them.
      const reach = strokes.reduce((most, stroke) => stroke.reduce((far, point) => Math.max(far, point.x), most), 0);
      value = typed || strokes.length ? signatureValue(Math.max(width, Math.ceil(reach) + 8), strokes, typed) : null;
      paint(); changed();
    }
    const point = event => { const rect = pad.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    pad.addEventListener("pointerdown", event => {
      if (context.readOnly || typing || event.button > 0) return;
      event.preventDefault(); pad.setPointerCapture(event.pointerId);
      current = [point(event)]; current.pointer = event.pointerId; paint();
    }, { signal: context.signal });
    pad.addEventListener("pointermove", event => {
      if (!current || current.pointer !== event.pointerId) return;
      // Coalesced events keep fast pen strokes smooth where the browser offers them.
      for (const sample of event.getCoalescedEvents?.() || [event]) current.push(point(sample));
      paint();
    }, { signal: context.signal });
    const finish = event => {
      if (!current || current.pointer !== event.pointerId) return;
      strokes.push(current); current = null; commit();
    };
    pad.addEventListener("pointerup", finish, { signal: context.signal });
    pad.addEventListener("pointercancel", event => { if (current?.pointer === event.pointerId) { current = null; paint(); } }, { signal: context.signal });
    undo.addEventListener("click", () => { strokes.pop(); commit(); });
    clear.addEventListener("click", () => { strokes = []; typedInput.value = ""; commit(); (typing ? typedInput : mode).focus(); });
    mode.addEventListener("click", () => {
      typing = !typing; typedField.hidden = !typing; strokes = []; typedInput.value = ""; commit();
      if (typing) typedInput.focus();
    });
    typedInput.addEventListener("input", event => { event.stopPropagation(); commit(); });
    typedInput.addEventListener("change", event => event.stopPropagation());
    const resize = new ResizeObserver(() => paint());
    resize.observe(pad);
    context.signal?.addEventListener("abort", () => resize.disconnect(), { once: true });
    typedInput.disabled = context.readOnly;
    return { element: group, control: group, group: true, describes: pad, focus: () => (typing ? typedInput : mode).focus(), getValue: () => value,
      destroy: () => { strokes = []; } };
  }
