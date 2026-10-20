  // ---------- flow: host options, dependent fields and dynamic sections (docs/flow.md#host-options-and-dependent-fields) ----------
  // A field with source "host" asks hooks.options(fieldId, values, { signal }) for its options as the reader reaches it, and
  // again when a field it depends on changes. Earlier requests are cancelled and late answers dropped; a previous answer that
  // is still allowed is kept. A field that depends on others without host options starts empty again when they change. A
  // section with source "host" asks hooks.fields(sectionId, values, { signal }) for its fields, read as strictly as the
  // document's; their answers join the proposal like any other.
  const FLOW_DYNAMIC_TYPES = ["text", "number", "date", "datetime", "time", "select", "toggle", "lookup", "choice", "multiChoice", "textarea", "list", "duration"];

  Object.assign(FlowView.prototype, {
    /** What follows an answer that changed: dependent fields, dynamic sections, checks, preset marks and the draft. */
    afterChange(field) {
      if (!field || this.destroyed) return;
      this.checksChanged?.(field);
      for (const other of [...this.model.fields.values()]) if (other.dependsOn.includes(field.id)) this.dependentChanged(other);
      for (const step of this.model.steps) for (const block of step.blocks) if (block.section?.host && block.section.dependsOn.includes(field.id) && this.sections.has(step.id)) this.loadFields(step, block);
      this.markPreset?.();
      this.draftChanged?.();
    },

    /** A field whose source changed: host options load again; any other dependent field starts empty again. */
    dependentChanged(field) {
      if (field.host) { this.loadOptions(field); return; }
      const empty = field.kind === "list" || field.kind === "records" || field.kind === "pick" ? [] : null;
      if (!flowSameValue(this.values.get(field.id) ?? null, empty)) this.setAnswer(field, empty, "depends");
    },

    /** Sets an answer the flow itself decided (dependencies, options, presets): the input shows it and the host hears it. */
    setAnswer(field, value, source) {
      const previous = this.values.get(field.id) ?? null;
      this.answersChanged();
      this.values.set(field.id, flowCopy(value));
      this.forgetHost(field);
      this.fields.get(field.id)?.mount(flowCopy(value));
      this.errors.delete(field.id); this.fields.get(field.id)?.message(null);
      this.emit("flowValueChanged", { field: field.id, value: flowCopy(value), previous: flowCopy(previous), source }, "onValueChange");
      this.afterChange(field);
      this.refreshVisibility();
    },

    /** Loads the options of host fields the reader can see and that have none yet. */
    prepareVisible() {
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
      fv.status(state.loading ? this.labels.flowOptionsLoading : state.error ? fill(this.labels.flowOptionsFailed, { message: state.error }) : null,
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
      Object.assign(state, { controller, ticket, loading: true });
      this.sectionState.set(section.id, state);
      this.paintSection(block, this.labels.flowFieldsLoading);
      const run = typeof this.hooks.fields === "function" ? signal => this.hooks.fields(section.id, this.getValues(), { signal }) : () => { throw new Error(this.labels.flowNoHostHook); };
      return this.timed("fields", run, controller).then(answer => {
        if (state.ticket !== ticket || this.destroyed || answer.cancelled) return;
        state.loading = false;
        let fields = null, problem = answer.failed || null;
        if (!problem) { try { fields = this.readDynamic(step, block, answer.value); } catch (error) { this.report(error, "fields"); problem = error.message; } }
        if (problem) { this.paintSection(block, fill(this.labels.flowFieldsFailed, { message: problem }), () => this.loadFields(step, block)); return; }
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
    },

    /** Cancels what the host is still answering: options, fields, checks, previews and pickers. */
    releaseHostWork() {
      for (const state of this.optionState.values()) state.controller?.abort();
      for (const state of this.sectionState?.values() || []) state.controller?.abort();
      for (const state of this.checkState.values()) state.controller?.abort();
      this.previewController?.abort();
      for (const picker of this.pickers.values()) { try { picker.api?.destroy(); } catch (error) { this.report(error, "picker"); } }
      this.optionState.clear(); this.sectionState?.clear(); this.checkState.clear(); this.pickers.clear();
      clearTimeout(this.draftTimer);
    }
  });
