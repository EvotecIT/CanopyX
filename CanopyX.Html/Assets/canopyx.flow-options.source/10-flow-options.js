  // ---------- the flow-options part: host options and host sections (docs/flow.md#host-options-and-dependent-fields) ----------
  // A field with source "host" asks hooks.options(fieldId, values, { signal }) for its options as the reader reaches it, and
  // again when a field it depends on changes. Earlier requests are cancelled and late answers dropped; a previous answer that
  // is still allowed is kept; a field that depends on others without host options starts empty again. A section with source "host" asks hooks.fields(sectionId, values, { signal }) for its fields,
  // read as strictly as the document's; their answers join the proposal like any other.
  const FLOW_PART_LABELS = {
    flowOptionsLoading: "Loading options…",
    flowOptionsFailed: "The options could not load: {message}",
    flowFieldsLoading: "Loading fields…",
    flowFieldsFailed: "The fields could not load: {message}"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const FLOW_DYNAMIC_TYPES = ["text", "number", "date", "datetime", "time", "select", "toggle", "lookup", "choice", "multiChoice", "textarea", "list", "duration"];

  FLOW_HOST.options = {
    /** A section whose fields the host supplies (source "host"), reloaded when the fields it depends on change. */
    section(section, raw) {
      section.host = raw.source === "host";
      if (raw.source !== undefined && !section.host) flowFail("section " + section.id + " has an unknown source");
      if (section.host ? raw.fields !== undefined && (!Array.isArray(raw.fields) || raw.fields.length) : !Array.isArray(raw.fields)) flowFail("section " + section.id + " needs an array of fields, or source \"host\" and none");
      if (raw.dependsOn !== undefined && (!section.host || !Array.isArray(raw.dependsOn) || !raw.dependsOn.length || raw.dependsOn.length > 16 || raw.dependsOn.some(name => typeof name !== "string")))
        flowFail("section " + section.id + " depends on 1 to 16 fields, as a host section only");
      section.dependsOn = raw.dependsOn ? [...new Set(raw.dependsOn)] : [];
    },
    /** A field's source "host" (a field that chooses only) and the fields it depends on. */
    field(field, raw, choosing, bad) {
      if (raw.source !== undefined && (!["document", "host"].includes(raw.source) || !choosing)) bad("takes a source as a field that chooses only");
      field.host = raw.source === "host";
      if (raw.dependsOn !== undefined && (!Array.isArray(raw.dependsOn) || !raw.dependsOn.length || raw.dependsOn.length > 16 || raw.dependsOn.some(name => typeof name !== "string"))) bad("needs 1 to 16 field ids in dependsOn");
      field.dependsOn = raw.dependsOn ? [...new Set(raw.dependsOn)] : [];
    },
    /** What depends on what: dependsOn names fields that exist, never secrets, never in a circle. */
    finish(model) {
      const known = (id, what) => { const field = model.fields.get(id); if (!field) flowFail(what + " names the unknown field '" + id + "'"); return field; };
      for (const field of model.fields.values()) for (const id of field.dependsOn) {
        if (id === field.id || known(id, "field " + field.id).type === "secret") flowFail("field " + field.id + " cannot depend on itself or on a secret");
      }
      const state = new Map(), visit = field => {
        if (state.get(field.id) === 2) return;
        if (state.get(field.id) === 1) flowFail("field " + field.id + " depends on itself through dependsOn");
        state.set(field.id, 1); field.dependsOn.forEach(id => visit(model.fields.get(id))); state.set(field.id, 2);
      };
      model.fields.forEach(visit);
      for (const step of model.steps) for (const block of step.blocks) if (block.section?.host) for (const id of block.section.dependsOn) if (known(id, "section " + block.section.id).type === "secret") flowFail("section " + block.section.id + " cannot depend on a secret");
    },
    /** Host sections and host options load as a step is first built. */
    built(view, step) {
      for (const block of step.blocks) if (block.section?.host) queueMicrotask(() => view.destroyed || view.sectionState?.has(block.section.id) || view.loadFields(step, block));
      queueMicrotask(() => view.destroyed || view.prepareVisible());
    }
  };

  /** A host field's loading line, or its failure with Try again, under the input; made the first time it shows. */
  function flowNote(view, fv, text, retry, failed) {
    let note = fv.note;
    if (!note) {
      if (!text) return;
      note = fv.note = h("p", "cx-flow-loading"); note.id = view.id + "-f-" + fv.field.id + "-note"; note.setAttribute("role", "status");
      // Above the field's message, the last line of the field.
      fv.element.querySelector(":scope > .cx-flow-error").before(note);
    }
    note.replaceChildren(); note.hidden = !text; note.classList.toggle("cx-flow-error", !!failed);
    if (text) { note.append(text); if (retry) { const again = h("button", "cx-flow-link"); again.type = "button"; setText(again, view.labels.flowRetry); again.addEventListener("click", retry); note.append(" ", again); } }
    if (fv.instance) fv.describe();
  }
  Object.assign(FlowView.prototype, {
    /** A field whose source changed: host options load again; any other dependent field starts empty again. */
    dependentChanged(field) {
      if (field.host) { this.loadOptions(field); return; }
      const empty = field.kind === "list" || field.kind === "records" || field.kind === "pick" ? [] : null;
      if (!flowSameValue(this.values.get(field.id) ?? null, empty)) this.setAnswer(field, empty, "depends");
    },
    /** Loads the options of host fields the reader can see and that have none yet. */
    prepareVisible() {
      // A host section whose fields have not loaded shows while its condition holds, with its loading line.
      for (const section of this.sections.values()) for (const block of section._cxBlocks || []) if (block.section?.host && !block.fields.length && flowTest(block.section.when, id => this.read(id))) block.element.hidden = false;
      for (const field of this.model.fields.values()) if (field.host && this.fields.has(field.id) && this.visible(field) && !this.optionState.has(field.id)) this.loadOptions(field);
    },

    /** Asks the host for a field's options; resolves once they are in (or failed). */
    loadOptions(field) {
      const state = this.optionState.get(field.id) || {}, controller = new AbortController(), ticket = {};
      state.controller?.abort();
      Object.assign(state, { controller, ticket, loading: true, error: null });
      this.optionState.set(field.id, state);
      this.paintOptions(field);
      const run = typeof this.hooks.options === "function" ? signal => this.hooks.options(field.id, this.getValues(), { signal }) : () => { throw new Error(this.labels.flowNoHostHook); };
      return this.timed("options", run, controller).then(answer => {
        if (state.ticket !== ticket || this.destroyed || answer.cancelled) return;
        state.loading = false;
        let options = null, problem = answer.failed || null;
        if (!problem) {
          try { options = Array.isArray(answer.value) ? flowOptions(answer.value, message => flowFail("the options of " + field.id + " " + message)) : flowFail("the options hook answers a list of options"); }
          catch (error) { this.report(error, "options"); problem = error.message; }
        }
        if (problem) { state.error = problem; this.paintOptions(field); return; }
        field.options = options; state.loaded = true;
        // A previous answer that is still allowed is kept; one the new options leave out is cleared.
        const value = this.values.get(field.id) ?? null, allowed = item => options.some(option => option.value === item && !option.disabledReason);
        const next = Array.isArray(value) ? value.filter(allowed) : value !== null && !allowed(value) ? null : value;
        if (!flowSameValue(next, value)) this.setAnswer(field, next, "options");
        else this.fields.get(field.id)?.mount(flowCopy(value));
        this.paintOptions(field);
        this.reviewStale = true;
      });
    },

    /** The loading line or the failure (with Retry) under a host field. */
    paintOptions(field) {
      const fv = this.fields.get(field.id), state = this.optionState.get(field.id);
      if (!fv || !state) return;
      flowNote(this, fv, state.loading ? this.labels.flowOptionsLoading : state.error ? fill(this.labels.flowOptionsFailed, { message: state.error }) : null,
        state.error ? () => this.loadOptions(field) : null, !!state.error);
    },

    /** Re-asks the host for a field's options (api.refreshOptions). */
    refreshOptions(id) {
      const field = this.model.fields.get(id);
      if (!field || !field.host) flowFail("refreshOptions takes the id of a field whose options come from the host");
      return this.loadOptions(field);
    },

    /** Asks the host for a dynamic section's fields and puts them in place of the ones it had. */
    loadFields(step, block) {
      const section = block.section, state = (this.sectionState ||= new Map()).get(section.id) || {}, controller = new AbortController(), ticket = {};
      state.controller?.abort();
      Object.assign(state, { controller, ticket, loading: true, error: null });
      this.sectionState.set(section.id, state);
      this.paintSection(block, this.labels.flowFieldsLoading);
      const run = typeof this.hooks.fields === "function" ? signal => this.hooks.fields(section.id, this.getValues(), { signal }) : () => { throw new Error(this.labels.flowNoHostHook); };
      return state.work = this.timed("fields", run, controller).then(answer => {
        if (state.ticket !== ticket || this.destroyed || answer.cancelled) return;
        state.loading = false;
        let fields = null, problem = answer.failed || null;
        if (!problem) { try { fields = this.readDynamic(step, block, answer.value); } catch (error) { this.report(error, "fields"); problem = error.message; } }
        if (problem) { state.error = problem; this.paintSection(block, fill(this.labels.flowFieldsFailed, { message: problem }), () => this.loadFields(step, block)); return; }
        this.placeDynamic(step, block, fields);
        this.paintSection(block, null);
      });
    },

    /** Reads a hooks.fields answer against the document: known types only, ids no other field uses, conditions that resolve. */
    readDynamic(step, block, raw) {
      if (!Array.isArray(raw) || raw.length > 64) flowFail("the fields hook answers a list of at most 64 fields");
      const model = this.model, old = new Set(block.fields.map(field => field.id)), scratch = { fields: new Map([...model.fields].filter(([id]) => !old.has(id))), sections: model.sections, checks: model.checks };
      const fields = raw.map(entry => {
        if (!flowIs(entry) || !FLOW_DYNAMIC_TYPES.includes(entry.type) || entry.path !== undefined || entry.parameter !== undefined || entry.source !== undefined || entry.dependsOn !== undefined) flowFail("a dynamic field has a type, path, parameter, source or dependsOn the host cannot supply");
        return flowField(entry, step, block.section, scratch);
      });
      for (const field of fields) {
        field.when = field.raw.when === undefined ? null : flowCondition(field.raw.when, scratch, { groups: 0, filters: 0 });
        if ([...flowRefs(field.when)].some(id => fields.some(other => other.id === id))) flowFail("a dynamic field's condition reads another dynamic field");
        field.refs = flowRefs(step.when, flowRefs(block.section.when, flowRefs(field.when)));
        field.dynamic = true;
      }
      return fields;
    },

    /** Swaps a section's fields for the host's: kept answers stay when they still fit, the inputs are built again. */
    placeDynamic(step, block, fields) {
      const model = this.model;
      for (const field of block.fields) { model.fields.delete(field.id); this.fields.get(field.id)?.destroy(); this.fields.delete(field.id); }
      for (const field of fields) {
        model.fields.set(field.id, field);
        const kept = this.values.get(field.id);
        if (kept === undefined || !flowFits(field, kept)) this.values.set(field.id, flowCopy(model.initial && Object.hasOwn(model.initial, field.id) && flowFits(field, model.initial[field.id]) ? model.initial[field.id] : field.start));
      }
      block.fields.splice(0, block.fields.length, ...fields);
      this.answersChanged(); this.visibility.clear(); this.reviewStale = true;
      const element = this.sections.get(step.id)?._cxBlocks?.find(entry => entry.fields === block.fields)?.element, grid = element?.querySelector(".cx-flow-grid");
      if (grid) {
        grid.replaceChildren(...fields.map(field => {
          const fv = flowFieldView(this, field);
          this.fields.set(field.id, fv); fv.mount(flowCopy(this.values.get(field.id) ?? null)); fv.element.hidden = !this.visible(field);
          return fv.element;
        }));
      }
      this.refreshVisibility();
    },

    /** The loading or failure line of a dynamic section. */
    paintSection(block, text, retry) {
      const element = [...this.sections.values()].flatMap(section => section._cxBlocks || []).find(entry => entry.fields === block.fields)?.element;
      if (!element) return;
      let note = element.querySelector(":scope > .cx-flow-loading");
      if (!text) { note?.remove(); return; }
      if (!note) { note = h("p", "cx-flow-loading"); note.setAttribute("role", "status"); element.querySelector(".cx-flow-grid").before(note); }
      note.replaceChildren(text);
      note.classList.toggle("cx-flow-error", !!retry);
      if (retry) { const again = h("button", "cx-flow-link"); again.type = "button"; setText(again, this.labels.flowRetry); again.addEventListener("click", retry); note.append(" ", again); }
    }
  });
