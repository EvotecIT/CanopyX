  // ---------- the flow-host part: what the host-connected parts share (docs/flow.md#host-connected-flows) ----------
  // Hooks that run with an AbortSignal and the host's timeout; what follows an answer that changed (dependent fields, host
  // sections, checks, preset marks, the draft); answers the flow sets itself; what follows the first paint and each step
  // change; and releasing what the host is still answering. The feature parts that need them require this part.
  const FLOW_PART_LABELS = {
    flowTimedOut: "The host did not answer in time.",
    flowNoHostHook: "No host answers this.",
    flowRetry: "Try again",
    flowCancel: "Cancel"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const FLOW_HOST_HOOKS = ["options", "fields", "check", "preview", "status"], FLOW_HOST_GROUPS = ["commands", "draftStore", "presetStore", "pickers"];
  const FLOW_HOST_CALLBACKS = ["onCheck", "onLeaving", "formatLink", "parseLink"];

  const flowEmit = FlowView.prototype.emit;
  Object.assign(FlowView.prototype, {
    /** Each changed answer is followed by what depends on it (afterChange). */
    emit(name, detail, callback, cancelable) {
      const go = flowEmit.call(this, name, detail, callback, cancelable);
      if (name === "flowValueChanged") this.afterChange(this.model.fields.get(detail.field));
      return go;
    },

    /** The hooks and options of host-connected flows; what the host is answering (options, checks, pickers and task states);
     *  and how long the host has to answer. */
    hostState() {
      if (!this.checkHostOptions(this.options, this.options.hooks ?? {})) flowFail("invalid flow options");
      this.optionState = new Map(); this.checkState = new Map(); this.pickers = new Map(); this.stepStatus = new Map(); this.timeout = this.options.timeout ?? 30000;
    },

    /** Whether the hooks, callbacks, timeout and headers of host-connected flows have their shapes. */
    checkHostOptions(options, hooks) {
      return !(FLOW_HOST_HOOKS.some(name => hooks[name] != null && typeof hooks[name] !== "function") || FLOW_HOST_GROUPS.some(name => hooks[name] != null && !flowIs(hooks[name])) ||
        FLOW_HOST_CALLBACKS.some(name => options[name] != null && typeof options[name] !== "function") || options.timeout != null && !(Number.isInteger(options.timeout) && options.timeout >= 100 && options.timeout <= 600000) ||
        options.headers != null && !(flowIs(options.headers) && Object.values(options.headers).every(value => typeof value === "string")));
    },

    /** Runs an asynchronous host hook with an AbortSignal and the host's timeout. A call its owner aborted (a newer request,
     *  Cancel, destroy) answers { cancelled } without an error event; a timeout aborts the signal and fails in place. */
    timed(name, run, controller = new AbortController()) {
      const relay = () => controller.abort(), lifetime = this.lifetime.signal;
      lifetime.addEventListener("abort", relay, { once: true });
      let timer = 0, timedOut = false;
      const expired = new Promise((resolve, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error(this.labels.flowTimedOut)); }, this.timeout); });
      return Promise.race([Promise.resolve().then(() => run(controller.signal)), expired]).then(value => controller.signal.aborted && !timedOut ? { cancelled: true } : { value }, error => {
        if (controller.signal.aborted && !timedOut) return { cancelled: true };
        this.report(error, name);
        return { failed: error && error.message ? error.message : String(error), timedOut };
      }).finally(() => { clearTimeout(timer); lifetime.removeEventListener("abort", relay); });
    },

    /** What follows an answer that changed: dependent fields, host sections, checks, preset marks and the draft. */
    afterChange(field) {
      // A flow built before this part loaded (another flow on the page needed it) has no host state and no host features.
      if (!field || this.destroyed || !this.checkState) return;
      this.checksChanged?.(field);
      for (const other of [...this.model.fields.values()]) if (other.dependsOn.includes(field.id)) this.dependentChanged?.(other);
      for (const step of this.model.steps) for (const block of step.blocks) if (block.section?.host && block.section.dependsOn.includes(field.id) && this.sections.has(step.id)) this.loadFields(step, block);
      this.markPreset?.();
      this.draftChanged?.();
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
      this.refreshVisibility();
    },

    /** What follows the first paint: presets the host keeps, a draft to resume, and the step the address names. */
    startHostFeatures() { this.loadPresets?.(); this.loadDraft?.(); this.startLinks?.(); },
    /** After a step change: the draft follows, and the address names the open step. */
    stepMoved() { if (this.checkState) { this.draftChanged?.(true); this.linkMoved?.(); } },

    /** Cancels what the host is still answering (options, fields, checks, previews, task states and pickers) and forgets the preset. */
    releaseHostWork() {
      if (!this.checkState) return;
      for (const state of this.optionState.values()) state.controller?.abort();
      for (const state of this.sectionState?.values() || []) state.controller?.abort();
      for (const state of this.checkState.values()) state.controller?.abort();
      this.previewController?.abort(); this.statusController?.abort();
      for (const picker of this.pickers.values()) { try { picker.api?.destroy(); } catch (error) { this.report(error, "picker"); } }
      this.optionState.clear(); this.sectionState?.clear(); this.checkState.clear(); this.pickers.clear();
      clearTimeout(this.draftTimer); this.preset = null;
    }
  });
