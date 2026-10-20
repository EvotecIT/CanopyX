  // ---------- flow: the field types flows add to the shared editors (docs/flow.md#fields) ----------
  // Each is an editor as the forms part defines one (docs/editing.md#custom-editors): { element, control, getValue(), error?() },
  // plus group: true when a label names a group of controls rather than one input. Values follow the field type's shape.
  const flowId = (context, suffix) => context.id + "-" + suffix;

  // Choice: native radio buttons, so arrow keys move and the group reads as one; cards show a description, badge and reason.
  function flowChoiceInput(context, field) {
    const cards = field.display ? field.display === "cards" : field.options.length <= 5, group = h("div", "cx-flow-choices" + (cards ? " cx-flow-cards" : " cx-flow-radios"));
    group.setAttribute("role", "radiogroup");
    const inputs = field.options.map((option, index) => {
      const item = h("label", cards ? "cx-flow-card" : "cx-flow-radio"), input = h("input", "cx-flow-choice-input"), body = h("span", "cx-flow-card-body"), title = h("span", "cx-flow-card-title");
      input.type = "radio"; input.name = context.id; input.value = String(index); input.checked = option.value === context.value;
      input.disabled = !!option.disabledReason || context.readOnly;
      setText(title, option.label);
      if (option.badge) { const badge = h("span", "cx-flow-badge"); setText(badge, option.badge); title.append(" ", badge); }
      body.appendChild(title);
      const notes = [];
      for (const [text, name] of [[option.description, "cx-flow-card-desc"], [option.disabledReason, "cx-flow-card-reason"]]) if (text) {
        const note = h("span", name); note.id = flowId(context, "o" + index + name.slice(-4)); setText(note, text); body.appendChild(note); notes.push(note.id);
      }
      if (notes.length) input.setAttribute("aria-describedby", notes.join(" "));
      item.append(input, body);
      if (cards) { const mark = h("span", "cx-flow-card-check"); mark.setAttribute("aria-hidden", "true"); item.appendChild(mark); }
      if (input.disabled) item.classList.add("cx-flow-disabled");
      group.appendChild(item);
      return input;
    });
    return { element: group, control: group, group: true, focus: () => (inputs.find(input => input.checked) || inputs.find(input => !input.disabled))?.focus(),
      getValue: () => { const at = inputs.findIndex(input => input.checked); return at < 0 ? null : field.options[at].value; } };
  }

  // Multiple choice: check boxes, grouped when the options name groups, with Select all, Clear and a live count.
  function flowMultiInput(context, field, labels) {
    const group = h("div", "cx-flow-multi"), list = h("div", "cx-flow-multi-list"), count = h("span", "cx-flow-count"), chosen = new Set(context.value || []);
    group.setAttribute("role", "group");
    count.setAttribute("aria-live", "polite");
    const inputs = [];
    let heading = null;
    field.options.forEach((option, index) => {
      if (option.group && option.group !== heading) { heading = option.group; const title = h("div", "cx-flow-multi-group"); setText(title, heading); list.appendChild(title); }
      const item = h("label", "cx-flow-check"), input = h("input"), text = h("span");
      input.type = "checkbox"; input.value = String(index); input.checked = chosen.has(option.value); input.disabled = !!option.disabledReason || context.readOnly;
      setText(text, option.label);
      item.append(input, text);
      if (option.description || option.disabledReason) { const note = h("span", "cx-flow-card-desc"); note.id = flowId(context, "o" + index); setText(note, option.disabledReason || option.description); item.appendChild(note); input.setAttribute("aria-describedby", note.id); }
      list.appendChild(item); inputs.push(input);
    });
    const paint = () => setText(count, fill(labels.flowSelectedCount, { count: inputs.filter(input => input.checked).length, total: inputs.length }));
    const tools = h("div", "cx-flow-multi-tools");
    if (inputs.length > 4 && !context.readOnly) for (const [text, on] of [[labels.flowSelectAll, true], [labels.flowSelectNone, false]]) {
      const button = h("button", "cx-flow-link"); button.type = "button"; setText(button, text);
      button.addEventListener("click", () => { inputs.forEach(input => { if (!input.disabled) input.checked = on; }); paint(); group.dispatchEvent(new Event("change", { bubbles: true })); });
      tools.appendChild(button);
    }
    tools.appendChild(count);
    group.addEventListener("change", paint);
    group.append(list, tools);
    paint();
    return { element: group, control: group, group: true, focus: () => inputs.find(input => !input.disabled)?.focus(),
      getValue: () => field.options.filter((option, index) => inputs[index].checked).map(option => option.value) };
  }

  // A text area: same checks as text; Enter makes a new line rather than moving on.
  function flowTextAreaInput(context, field) {
    const area = h("textarea", "cx-flow-input cx-flow-textarea");
    area.rows = field.rows; area.value = context.value ?? ""; area.readOnly = context.readOnly;
    if (field.placeholder) area.placeholder = field.placeholder;
    return { element: area, getValue: () => area.value === "" ? null : area.value };
  }

  // A list: one value per row with Add and Remove; lines pasted into a row become rows of their own.
  function flowListInput(context, field, labels) {
    const group = h("div", "cx-flow-list"), rows = h("ul", "cx-flow-list-items"), add = h("button", "cx-flow-btn cx-flow-list-add");
    group.setAttribute("role", "group");
    add.type = "button"; setText(add, "+ " + labels.flowAdd); add.setAttribute("aria-label", fill(labels.flowAddItem, { field: field.label }));
    const renumber = () => [...rows.children].forEach((row, index) => {
      const input = row.firstChild, remove = row.lastChild;
      input.setAttribute("aria-label", fill(labels.flowItemLabel, { field: field.label, index: index + 1 }));
      remove.setAttribute("aria-label", fill(labels.flowRemoveItem, { item: input.value.trim() || fill(labels.flowItemLabel, { field: field.label, index: index + 1 }) }));
    });
    const row = (value, focus) => {
      const item = h("li", "cx-flow-list-item"), input = h("input", "cx-flow-input"), remove = h("button", "cx-flow-icon-btn");
      input.type = "text"; input.value = value; input.autocomplete = "off"; input.readOnly = context.readOnly;
      if (field.placeholder) input.placeholder = field.placeholder;
      remove.type = "button"; setText(remove, "×"); remove.hidden = context.readOnly;
      remove.addEventListener("click", () => {
        const next = item.nextSibling?.firstChild || item.previousSibling?.firstChild;
        item.remove(); if (!rows.children.length) row("", false);
        renumber(); (next || add).focus(); group.dispatchEvent(new Event("change", { bubbles: true }));
      });
      input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); if (!context.readOnly) row("", true); } });
      input.addEventListener("input", renumber);
      input.addEventListener("paste", event => {
        if (context.readOnly) { event.preventDefault(); return; }
        const text = event.clipboardData?.getData("text") || "", lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length < 2) return;
        event.preventDefault();
        input.value = lines[0];
        let after = item;
        for (const line of lines.slice(1, 1000)) { const added = row(line, false); rows.insertBefore(added, after.nextSibling); after = added; }
        renumber(); group.dispatchEvent(new Event("change", { bubbles: true }));
      });
      item.append(input, remove); rows.appendChild(item);
      if (focus) { renumber(); input.focus(); }
      return item;
    };
    for (const value of context.value?.length ? context.value : [""]) row(value, false);
    add.hidden = context.readOnly;
    add.addEventListener("click", () => row("", true));
    group.append(rows, add);
    renumber();
    return { element: group, control: group, group: true, focus: () => (rows.querySelector("input[aria-invalid]") || rows.querySelector("input"))?.focus(),
      // Marks the rows whose values fail (the group's message says why), rather than every row.
      flag: bad => rows.querySelectorAll("input").forEach(input => { if (bad(input.value.trim())) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }),
      getValue: () => [...rows.querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean) };
  }

  // A secret: masked, with a reveal button. Its value lives in the input only; the view keeps it in a closure, never in state.
  function flowSecretInput(context, field, labels, stored) {
    const box = h("div", "cx-flow-secret"), input = h("input", "cx-flow-input");
    input.type = "password"; input.autocomplete = "new-password"; input.spellcheck = false; input.readOnly = context.readOnly;
    box.appendChild(input);
    if (field.reveal) {
      const reveal = h("button", "cx-flow-btn cx-flow-reveal");
      reveal.type = "button"; reveal.setAttribute("aria-pressed", "false"); reveal.setAttribute("aria-label", fill(labels.flowSecretReveal, { field: field.label }));
      setText(reveal, labels.flowSecretShow);
      reveal.addEventListener("click", () => {
        const shown = input.type === "password";
        input.type = shown ? "text" : "password"; reveal.setAttribute("aria-pressed", String(shown)); setText(reveal, shown ? labels.flowSecretHide : labels.flowSecretShow);
      });
      box.appendChild(reveal);
    }
    return { element: box, control: input, secret: true, hint: stored ? labels.flowSecretHint : null, conceal: () => { input.type = "password"; box.querySelector(".cx-flow-reveal")?.setAttribute("aria-pressed", "false"); },
      getValue: () => input.value, clear: () => { input.value = ""; } };
  }

  // A duration: a whole number and a unit, written as ISO 8601 (PT15M). A starting value shows in the largest unit that divides it.
  function flowDurationInput(context, field, labels) {
    const group = h("div", "cx-flow-duration"), amount = h("input", "cx-flow-input cx-flow-amount"), unit = h("select", "cx-flow-input cx-flow-unit");
    group.setAttribute("role", "group");
    amount.type = "text"; amount.inputMode = "numeric"; amount.autocomplete = "off"; amount.readOnly = context.readOnly; unit.disabled = context.readOnly;
    unit.setAttribute("aria-label", labels.flowUnit);
    amount.setAttribute("aria-labelledby", context.id + "-label");
    for (const name of field.units) unit.add(new Option(labels["flowUnit" + name[0].toUpperCase() + name.slice(1)], name));
    const seconds = context.value == null ? null : flowSeconds(context.value);
    const start = seconds == null ? field.units[Math.min(1, field.units.length - 1)] : seconds === 0 ? field.units[0] : [...field.units].reverse().find(name => seconds % FLOW_UNITS[name] === 0) || field.units[0];
    unit.value = start;
    if (seconds != null) amount.value = numberFormat(context.locale, 0, 0).format(seconds / FLOW_UNITS[start]);
    group.append(amount, unit);
    const read = () => amount.value.trim() === "" ? null : editParseNumber(amount.value, context.locale);
    return { element: group, control: group, group: true, amount, describes: amount, focus: () => amount.focus(),
      error: () => { const value = read(), seconds = value * FLOW_UNITS[unit.value]; return value !== null && !(Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(seconds) && flowSeconds(flowDuration(seconds)) !== null) ? fill(labels.flowDurationInvalid, { field: field.label }) : null; },
      getValue: () => { const value = read(); return value === null ? null : flowDuration(value * FLOW_UNITS[unit.value]); } };
  }
