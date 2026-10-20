  // ---------- flow: the view, its answers and visibility ----------
  // Answers live in one map by field id, hidden ones included, so going back never loses them; visible() decides what counts.
  // Secret values live only in their inputs and in a closure map the submit accessor reads once (docs/flow.md#secrets).
  let FLOW_SEQUENCE = 0;
  const flowCopy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const flowSameValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  const FLOW_HOOKS = ["validateStep", "validateFlow", "submit"], FLOW_CALLBACKS = ["onReady", "onStepChange", "onValueChange", "onSubmit", "onSubmitted", "onReload"];

  class FlowView {
    constructor(host, options, editors) {
      const hooks = options.hooks ?? {};
      if (!flowIs(hooks) || FLOW_HOOKS.some(name => hooks[name] != null && typeof hooks[name] !== "function") || hooks.validators != null && !flowIs(hooks.validators) ||
          FLOW_CALLBACKS.some(name => options[name] != null && typeof options[name] !== "function") || options.editors != null && !flowIs(options.editors) ||
          options.values != null && !flowIs(options.values)) flowFail("invalid flow options");
      this.host = host; this.options = options; this.hooks = hooks;
      this.model = flowRead(options.flow);
      this.labels = flowLabels(this.model.labels, options.labels);
      this.editors = Object.assign({}, editors, options.editors);
      this.id = "cx-flow-" + ++FLOW_SEQUENCE;
      this.lang = host.closest("[lang]")?.lang || document.documentElement.lang || "";
      this.lifetime = new AbortController();
      this.fields = new Map(); this.sections = new Map(); this.visibility = new Map();
      this.secrets = new Map(); this.errors = new Map(); this.hostErrors = new Map(); this.hostStepErrors = new Map(); this.stepErrors = new Map(); this.completed = new Set();
      this.banner = null; this.phase = "form"; this.returnToReview = false;
      this.begin(options.values);
      this.build();
    }

    /** The starting answers: initial values in edit mode, else defaults, then the host's values. */
    begin(values) {
      const model = this.model;
      this.values = new Map();
      for (const field of model.fields.values()) {
        if (field.type === "secret") continue;
        const initial = model.initial && Object.hasOwn(model.initial, field.id) ? model.initial[field.id] : field.start;
        this.values.set(field.id, flowCopy(initial));
      }
      for (const [id, value] of Object.entries(values || {})) this.assign(id, value);
      this.startValues = new Map([...this.values].map(([id, value]) => [id, flowCopy(value)]));
      this.secrets.clear(); this.errors.clear(); this.hostErrors.clear(); this.hostStepErrors.clear(); this.stepErrors.clear(); this.showAll = undefined; this.reviewStale = true; this.completed.clear(); this.visibility.clear();
      this.banner = null; this.returnToReview = false;
      this.step = this.visibleSteps()[0];
      // Edit mode starts from settings that were valid when saved: steps whose fields pass their own checks count as complete.
      if (model.initial) for (const step of this.visibleSteps()) if (step.type === "form" && this.stepFields(step).every(field => !this.problemNow(field))) this.completed.add(step.id);
    }

    assign(id, value) {
      const field = this.model.fields.get(id);
      if (!field || field.type === "secret" || !flowFits(field, value)) flowFail("no field '" + id + "' takes that value");
      this.values.set(id, flowCopy(value));
    }

    keeps(field) { return field.type === "secret" && this.model.stored.has(field.id) && field.keepWhenBlank !== false; }

    // ---------- visibility ----------
    read(id) { const field = this.model.fields.get(id); return field && this.visible(field) ? this.values.get(id) ?? null : null; }
    stepVisible(step) { return flowTest(step.when, id => this.read(id)); }
    visible(field) {
      if (this.visibility.has(field.id)) return this.visibility.get(field.id);
      const shown = this.stepVisible(field.step) && (!field.section || flowTest(field.section.when, id => this.read(id))) && flowTest(field.when, id => this.read(id));
      this.visibility.set(field.id, shown);
      return shown;
    }
    visibleSteps() { return this.model.steps.filter(step => this.stepVisible(step)); }
    stepFields(step) { return step.blocks.flatMap(block => block.fields).filter(field => this.visible(field)); }
    reviewStep() { const last = this.model.steps[this.model.steps.length - 1]; return last.type === "review" ? last : null; }

    /** The visible answers, never secrets. */
    getValues() {
      const values = {};
      for (const field of this.model.fields.values()) if (field.type !== "secret" && this.visible(field)) values[field.id] = flowCopy(this.values.get(field.id) ?? null);
      return values;
    }

    // ---------- answers changing ----------
    /** Reads a field's input after the reader changed it, updates visibility and tells the host. */
    changed(field, source) {
      const fv = this.fields.get(field.id);
      if (!fv || this.destroyed) return;
      const result = fv.read();
      fv.pending = result.error || null;
      if (field.type === "secret") {
        const before = this.secrets.get(field.id) ?? null;
        if (result.value) this.secrets.set(field.id, result.value); else this.secrets.delete(field.id);
        // A host's message about a field stands until the reader changes that field.
        if (before !== (result.value || null)) { this.forgetHost(field); this.emit("flowValueChanged", { field: field.id, source: "edit" }, "onValueChange"); }
      } else if (!result.error) {
        const previous = this.values.get(field.id) ?? null;
        if (!flowSameValue(previous, result.value)) {
          this.values.set(field.id, result.value);
          this.forgetHost(field);
          this.emit("flowValueChanged", { field: field.id, value: flowCopy(result.value), previous: flowCopy(previous), source: "edit" }, "onValueChange");
        }
      }
      // Leaving the field checks it once (the caller); while typing, a field already showing a problem is checked again.
      if (source !== "blur" && this.errors.has(field.id)) this.checkField(field);
      this.refreshVisibility();
    }

    /** A host's messages about a field and its step stand until the reader changes an answer there. */
    forgetHost(field) {
      if (this.hostStepErrors.delete(field.step.id)) { const summary = this.sections.get(field.step.id)?._cxSummary; if (summary) summary.hidden = true; }
      this.hostErrors.delete(field.id); this.reviewStale = true;
    }

    /** Shows and hides fields, sections and steps after an answer changed. */
    refreshVisibility() {
      this.visibility.clear();
      for (const fv of this.fields.values()) fv.element.hidden = !this.visible(fv.field);
      for (const [stepId, section] of this.sections) for (const block of section._cxBlocks || []) block.element.hidden = !block.fields.some(field => this.visible(field));
      // The rail (and an automatic orientation) follows the steps an answer shows or hides.
      if (!this.root) return;
      if (this.visibleSteps().map(step => step.id).join() + (this.orientation() === "stack" ? "|stack" : "") !== this.railKey) { this.railTooWide = false; this.render(); }
      else this.renderRail();
    }

    /** Sets answers as a host change: the inputs show them and the host hears flowValueChanged with source "api". */
    setValues(partial) {
      if (!flowIs(partial)) flowFail("setValues takes an object of field values");
      for (const [id, value] of Object.entries(partial)) {
        const previous = this.values.get(id) ?? null;
        this.assign(id, value);
        this.fields.get(id)?.mount(flowCopy(value));
        this.errors.delete(id); this.hostErrors.delete(id); this.fields.get(id)?.message(null);
        if (!flowSameValue(previous, value)) this.emit("flowValueChanged", { field: id, value: flowCopy(value), previous: flowCopy(previous), source: "api" }, "onValueChange");
      }
      this.refreshVisibility();
      this.refreshReview();
    }

    /** Rebuilds an open review page once after host calls; a call made while its checks run is part of them. */
    refreshReview() {
      if (this.step.type !== "review" || this.phase !== "form" || this.reviewChecking || this.reviewQueued) return;
      this.reviewQueued = true;
      queueMicrotask(() => { this.reviewQueued = false; if (this.destroyed || this.step.type !== "review") return; this.reviewStale = true; this.render(); this.stage.querySelector(".cx-flow-step-title")?.focus({ preventScroll: true }); });
    }

    isDirty() { return this.secrets.size > 0 || [...this.values].some(([id, value]) => !flowSameValue(value, this.startValues.get(id))); }
    getStep() { return this.step.id; }
    getState() { return { step: this.step.id, values: Object.fromEntries([...this.values].map(([id, value]) => [id, flowCopy(value)])), completed: [...this.completed] }; }
    setState(state) {
      if (!flowIs(state) || state.values != null && !flowIs(state.values) || state.completed != null && !Array.isArray(state.completed)) flowFail("setState takes a flow state");
      for (const [id, value] of Object.entries(state.values || {})) {
        this.assign(id, value); this.fields.get(id)?.mount(flowCopy(value));
        this.errors.delete(id); this.hostErrors.delete(id); this.fields.get(id)?.message(null);
      }
      this.completed = new Set((state.completed || []).filter(id => this.model.steps.some(step => step.id === id)));
      this.refreshVisibility();
      const target = this.model.steps.find(step => step.id === state.step);
      return this.go(target && this.stepVisible(target) ? target : this.visibleSteps()[0], "jump", true);
    }
    reset() {
      for (const fv of this.fields.values()) fv.destroy();
      this.fields.clear(); this.sections.clear();
      this.begin(this.options.values);
      this.phase = "form";
      this.render();
      return true;
    }

    // ---------- events and hooks ----------
    /** Dispatches canopyx:<name> on the host and calls the matching callback; false when a cancelable event was cancelled. */
    emit(name, detail, callback, cancelable = false) {
      const event = new CustomEvent("canopyx:" + name, { detail, bubbles: true, cancelable });
      const go = this.host.dispatchEvent(event);
      if (callback && typeof this.options[callback] === "function") try { this.options[callback](detail); } catch (error) { this.report(error, callback); }
      return go;
    }
    report(error, hook) {
      this.host.dispatchEvent(new CustomEvent("canopyx:error", { detail: { error, hook }, bubbles: true }));
    }
    /** Runs a host hook in isolation: an exception or rejection becomes a message in place and an error event. */
    async hook(name, run) {
      try { return { value: await run() }; }
      catch (error) { this.report(error, name); return { failed: error && error.message ? error.message : String(error) }; }
    }
  }
