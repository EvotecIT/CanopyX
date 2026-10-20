  // ---------- flow: a field on the page and its messages ----------
  // Labels sit above fields with "(optional)" in the label and no asterisks; help sits under the label, before the input; the
  // message sits under the input. aria-describedby joins the help and the message, aria-invalid marks an error. The built-in
  // editors are the forms part's, the same as in grid cells and the record drawer; flows add choice, multiChoice, textarea,
  // list, secret and duration (35-flow-inputs.js); custom fields take an editor a plugin or the host registers.
  const FLOW_SHARED_EDITORS = new Set(["text", "number", "date", "datetime", "time", "select", "toggle", "lookup"]);

  /** Builds a field for a view: { field, element, read(), write(value), focus(), message(text) }. */
  function flowFieldView(view, field) {
    const id = view.id + "-f-" + field.id, wrapper = h("div", "cx-flow-field cx-flow-type-" + field.type + (field.width === "half" ? " cx-flow-half" : ""));
    wrapper.dataset.cxField = field.id;
    const label = h(FLOW_SHARED_EDITORS.has(field.type) || ["textarea", "secret", "custom"].includes(field.type) ? "label" : "div", "cx-flow-label");
    label.id = id + "-label";
    setText(label, field.label);
    if (!field.required && field.type !== "toggle" && !field.readOnly) { const optional = h("span", "cx-flow-optional"); setText(optional, " " + view.labels.flowOptional); label.appendChild(optional); }
    const help = field.help ? h("p", "cx-flow-help") : null, hint = h("p", "cx-flow-help cx-flow-hint"), message = h("p", "cx-flow-error");
    if (help) { help.id = id + "-help"; setText(help, field.help); }
    hint.id = id + "-hint"; hint.hidden = true;
    message.id = id + "-error"; message.hidden = true;
    const fv = { field, element: wrapper, label, message, instance: null, abort: null };
    const create = value => {
      fv.abort?.abort(); fv.abort = new AbortController();
      const context = flowEditorContext(view, field, id, value, fv.abort.signal);
      const instance = flowEditor(view, field, context);
      if (!instance || !(instance.element instanceof Element) || typeof instance.getValue !== "function") flowFail("the editor of field " + field.id + " must return an element and getValue");
      // Empty toggles and collections stay null while focus passes through them; only an actual edit supplies a value.
      if (value == null && ["toggle", "list", "multiChoice"].includes(field.type)) {
        let touched = false;
        const read = instance.getValue;
        for (const event of ["input", "change"]) instance.element.addEventListener(event, () => { touched = true; }, { signal: fv.abort.signal });
        instance.getValue = () => touched ? read() : null;
      }
      return instance;
    };
    fv.mount = value => {
      try { fv.instance?.destroy?.(); } catch (error) { view.report(error, "editor"); }
      fv.instance = create(value);
      fv.pending = null;
      const control = fv.control = fv.instance.control || fv.instance.element;
      if (fv.instance.group) { control.setAttribute("aria-labelledby", label.id); label.removeAttribute("for"); }
      else { control.id = id; if (label.tagName === "LABEL") label.htmlFor = id; }
      if (field.type === "toggle") control.setAttribute("role", "switch");
      if (fv.instance.hint) { setText(hint, fv.instance.hint); hint.hidden = false; } else hint.hidden = true;
      fv.describe();
      const holder = wrapper.querySelector(".cx-flow-control");
      holder.replaceChildren(fv.instance.element);
      if (field.type === "toggle") holder.appendChild(label);
    };
    fv.describe = () => {
      // A group's own input (a duration's amount) carries the description and state, so focusing it announces them.
      const target = fv.instance.describes || fv.control;
      const ids = [help && help.id, !hint.hidden && hint.id, !message.hidden && message.id].filter(Boolean);
      if (ids.length) target.setAttribute("aria-describedby", ids.join(" ")); else target.removeAttribute("aria-describedby");
      if (message.hidden) target.removeAttribute("aria-invalid"); else target.setAttribute("aria-invalid", "true");
    };
    /** The answer as the reader left it: { value } or { error } while the input is not a value yet. Secrets read as text. */
    fv.read = () => {
      const parse = fv.instance.error?.() || null;
      if (parse) return { error: parse };
      let value = fv.instance.getValue();
      if (value === "" || value === undefined) value = null;
      if (field.type !== "secret" && !flowFits(field, value)) return { error: fill(view.labels.gridEditPattern, { column: field.label }) };
      return { value };
    };
    fv.message = text => { setText(message, text || ""); message.hidden = !text; fv.describe(); wrapper.classList.toggle("cx-flow-invalid", !!text); };
    fv.focus = () => fv.instance.focus ? fv.instance.focus() : fv.control.focus({ preventScroll: false });
    fv.destroy = () => { fv.abort?.abort(); try { fv.instance?.destroy?.(); } catch (error) { view.report(error, "editor"); } };
    const holder = h("div", "cx-flow-control" + (field.type === "toggle" ? " cx-flow-toggle" : ""));
    if (field.type === "toggle") wrapper.append(holder); else wrapper.append(label);
    if (help) wrapper.appendChild(help);
    wrapper.append(hint);
    if (field.type !== "toggle") wrapper.append(holder);
    wrapper.append(message);
    return fv;
  }

  // The context every editor receives (docs/editing.md#custom-editors), with mode "flow" and the flow's answers as the row.
  function flowEditorContext(view, field, id, value, signal) {
    const kind = field.kind === "number" || field.kind === "datetime" ? field.kind : "text";
    return Object.freeze({ id, value, text: value == null ? "" : flowDisplay(view, field, value), readOnly: field.readOnly,
      row: Object.freeze({ id: view.model.id, cells: Object.freeze(view.getValues()) }), column: Object.freeze({ id: field.id, title: field.label, kind }),
      editor: Object.freeze({ type: field.type, placeholder: field.placeholder, step: field.raw.step }), options: field.options.length ? field.options : null,
      rules: field.spec.rules, labels: view.labels, locale: view.lang, timeZone: view.model.local ? "local" : "utc", mode: "flow", initial: undefined, signal,
      lookupMinLength: 1, commit: () => view.changed(field, "edit"), cancel: () => {},
      lookup: search => { const folded = foldText(search.trim()); return field.options.filter(option => !option.disabledReason && foldText(option.label).includes(folded)).slice(0, 20); },
      // A picked suggestion is an answer at once, not only when focus leaves the field.
      remember: () => queueMicrotask(() => view.changed(field, "edit")) });
  }

  // The shared editors, the flow's own inputs, or a registered editor for a custom field.
  function flowEditor(view, field, context) {
    switch (field.type) {
      case "choice": return flowChoiceInput(context, field);
      case "multiChoice": return flowMultiInput(context, field, view.labels);
      case "textarea": return flowTextAreaInput(context, field);
      case "list": return flowListInput(context, field, view.labels);
      case "secret": return flowSecretInput(context, field, view.labels, view.keeps(field));
      case "duration": return flowDurationInput(context, field, view.labels);
      case "custom": {
        const editor = view.editors[field.raw.editor];
        if (!editor || typeof editor.create !== "function") flowFail("the field " + field.id + " names the editor '" + field.raw.editor + "', which nobody registered");
        return editor.create(context);
      }
      default: {
        const instance = EDIT_EDITORS[field.type].create(context), control = instance.control || instance.element;
        // The shared editors fit grid cells; in a flow they take the form's control style, and read-only fields stay shown.
        control.classList.add("cx-flow-input");
        if (field.readOnly) { control.disabled = control.tagName === "SELECT" || control.type === "checkbox"; control.readOnly = true; }
        return instance;
      }
    }
  }

  /** An answer as the review page shows it, in the page language and the flow's time zone. */
  function flowDisplay(view, field, value) {
    const labels = view.labels, option = item => field.options.find(entry => entry.value === item)?.label ?? String(item);
    if (flowEmpty(value)) return labels.flowNotProvided;
    switch (field.type) {
      case "number": return numberFormat(view.lang, 0, 20).format(value);
      case "toggle": return value ? field.onText || labels.flowOn : field.offText || labels.flowOff;
      case "select": case "choice": case "lookup": return option(value);
      case "multiChoice": return value.map(option).join(", ");
      case "list": return value.join("\n");
      case "date": return flowDate(view, value + "T00:00:00Z", { dateStyle: "medium", timeZone: "UTC" });
      case "datetime": return flowDate(view, value, { dateStyle: "medium", timeStyle: "short", timeZone: view.model.local ? undefined : "UTC" }) + (view.model.local ? "" : " UTC");
      case "duration": return flowWords(view, flowSeconds(value), field.units[0]);
      default: return String(value);
    }
  }
  function flowDate(view, iso, options) {
    try { return new Intl.DateTimeFormat(view.lang || undefined, options).format(new Date(iso)); } catch (error) { return iso; }
  }
  /** A duration in words, in the largest unit that divides it: "15 minutes", "2 hours". */
  function flowWords(view, seconds, smallest = "seconds") {
    const unit = ["days", "hours", "minutes", "seconds"].find(name => seconds % FLOW_UNITS[name] === 0 && seconds >= FLOW_UNITS[name]) || (seconds ? "seconds" : smallest), count = seconds / FLOW_UNITS[unit];
    const label = view.labels["flow" + unit[0].toUpperCase() + unit.slice(1)];
    return fill(plural(label, count, view.lang), { count: numberFormat(view.lang, 0, 0).format(count) });
  }
