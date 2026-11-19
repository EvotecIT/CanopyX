  // ---------- the flow-signature part: signature fields, drawn or typed (docs/flow-inputs.md#signatures) ----------
  // The field is the shared signature pad (canopyx.signature-pad.source) in black ink on a transparent background; its answer
  // is { svg, png }, which the server checks too (CanopyFlowValues).
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

  FLOW_HOST.signature = {
    fits: (field, value) => signatureFits(value),
    input: (context, field, view) => flowSignatureInput(context, view.labels),
    display: view => view.labels.flowSigned
  };

  function flowSignatureInput(context, labels) {
    let instance;
    const pad = signaturePad({ readOnly: context.readOnly, value: context.value, signal: context.signal, classes: { button: "cx-flow-btn", link: "cx-flow-link", input: "cx-flow-input" },
      labels: { pad: labels.flowSignaturePad, undo: labels.flowSignatureUndo, clear: labels.flowSignatureClear, type: labels.flowSignatureType, draw: labels.flowSignatureDraw, typed: labels.flowSignatureTyped },
      onChange: () => instance?.element.dispatchEvent(new Event("change", { bubbles: true })) });
    pad.element.classList.add("cx-flow-signature");
    instance = { element: pad.element, control: pad.element, group: true, describes: pad.pad, focus: pad.focus, getValue: pad.getValue, destroy: pad.destroy };
    return instance;
  }
