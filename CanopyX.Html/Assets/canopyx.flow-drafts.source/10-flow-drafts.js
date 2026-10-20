  // ---------- the flow-drafts part: drafts and presets (docs/flow.md#drafts and #presets) ----------
  // Drafts keep the answers (never secrets, never sensitive fields), the open step, the completed steps, the preset and the
  // edit baseline: in the session, in local storage when the page opts in, or in the host's draftStore { load, save, clear }.
  // A flow that finds a draft offers to resume it, and warns when the settings changed since (another baseline). Presets are
  // named starting answers from the document or the host's presetStore { list, save }; answers changed from the
  // preset carry a quiet "changed" mark, and the review page says how many changed.
  const FLOW_PART_LABELS = {
    flowChangedMark: "Changed",
    flowSaveDraft: "Save draft",
    flowDraftSaved: "Draft saved",
    flowDraftFailed: "The draft was not saved.",
    flowDraftFound: "Saved draft",
    flowDraftFrom: "You have a draft saved {time}.",
    flowDraftStale: "The settings changed after this draft was saved.",
    flowDraftResume: "Resume where you left off",
    flowDraftRestart: "Start again",
    flowStartFrom: "Start from",
    flowPresetSave: "Save as preset",
    flowPresetNone: "Defaults",
    flowPresetsSaved: "Saved presets",
    flowPresetApplied: "Started from {preset}",
    flowPresetName: "Preset name",
    flowPresetFailed: "The preset was not saved.",
    flowPresetSaved: "Saved the preset {preset}",
    flowPresetChanges: "[one]Based on {preset}, {count} change[other]Based on {preset}, {count} changes",
    flowPresetCurrent: "Current settings"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const FLOW_DRAFT_DELAY = 800;

  /** A preset: named starting answers. Never secrets; only fields that exist, with values that fit them. */
  function flowPreset(raw, model) {
    flowKeys(raw, ["id", "label", "description", "values"], "A preset");
    const preset = { id: flowName(raw.id, "A preset id"), label: flowString(raw.label, 200, "A preset label", true), description: flowString(raw.description, 1000, "A preset description"), values: {} };
    if (!flowIs(raw.values)) flowFail("preset " + preset.id + " needs an object of values");
    for (const [id, value] of Object.entries(raw.values)) {
      const field = model.fields.get(id);
      if (!field || field.type === "secret" || !flowFits(field, value)) flowFail("preset " + preset.id + " has no value for '" + id + "' that fits a field");
      preset.values[id] = value;
    }
    return Object.freeze(preset);
  }

  /** The quiet "changed" mark beside a field's label; it joins the label only while it shows. */
  function flowMark(view, fv, on) {
    if (on && !fv.mark) { fv.mark = h("span", "cx-flow-mark-changed"); setText(fv.mark, view.labels.flowChangedMark); }
    if (on && fv.mark.parentNode !== fv.label) fv.label.appendChild(fv.mark); else if (!on) fv.mark?.remove();
  }

  const flowStateOf = FlowView.prototype.getState;
  FLOW_HOST.drafts = {
    /** The document's presets: at most 32, with distinct ids. */
    presets(raw, model) {
      if (!Array.isArray(raw) || raw.length > 32) flowFail("a flow has at most 32 presets");
      const presets = raw.map(item => flowPreset(item, model));
      if (new Set(presets.map(preset => preset.id)).size !== presets.length) flowFail("two presets share an id");
      return presets;
    },
    /** The document's presets and draft store. */
    document(doc, model) {
      if (doc.presets !== undefined) model.presets = this.presets(doc.presets, model);
      model.draft = doc.draft ?? "none";
      if (!["none", "session", "local", "host"].includes(model.draft)) flowFail("the flow's draft store is unknown");
    },
    review: (view, section) => view.reviewPreset(section),
    /** The preset the answers started from joins the proposal; a saved or accepted proposal ends the draft. */
    proposal(view, proposal) { if (view.preset) proposal.preset = view.preset.id; },
    settled: (view, answer) => view.draftSettled(answer)
  };
  Object.assign(FlowView.prototype, {
    /** The state names the preset the answers started from. */
    getState() { const state = flowStateOf.call(this); if (this.preset) state.preset = this.preset.id; return state; },
    /** Save draft, quiet beside Back, when the flow keeps drafts. */
    draftButton() {
      if (!this.draftStore()) return null;
      const save = h("button", "cx-flow-btn cx-flow-quiet"); save.type = "button"; setText(save, this.labels.flowSaveDraft);
      save.addEventListener("click", () => this.saveDraft(true).catch(error => this.report(error, "draft")));
      return save;
    },

    /** The draft store in use, or null: session or local storage, or the host's. */
    draftStore() {
      if (this.storeCache !== undefined) return this.storeCache;
      const model = this.model, key = "canopyx:flow-draft:" + model.id;
      let store = null;
      if (model.draft === "session" || model.draft === "local") {
        // Storage can be refused (a private window, a sandbox): the flow then works without drafts.
        const area = () => { try { return model.draft === "local" ? global.localStorage : global.sessionStorage; } catch (error) { return null; } };
        store = { load: () => { const raw = area()?.getItem(key); return raw ? JSON.parse(raw) : null; }, save: (id, draft) => area()?.setItem(key, JSON.stringify(draft)), clear: () => area()?.removeItem(key) };
      } else if (model.draft === "host") {
        const host = this.hooks.draftStore;
        if (host && ["load", "save", "clear"].every(name => typeof host[name] === "function")) store = { load: () => host.load(model.id), save: (id, draft) => host.save(model.id, draft), clear: () => host.clear(model.id) };
      }
      return this.storeCache = store;
    },

    draftDocument() {
      const values = {};
      for (const [id, value] of this.values) { const field = this.model.fields.get(id); if (field && !field.sensitive && field.type !== "secret") values[id] = flowCopy(value); }
      // A task list's hub is not a step of the document: its draft names the hub's id ("#tasks"), which a store keeps as it is.
      const draft = { kind: "flowDraft", version: 1, flow: this.model.id, step: this.step.id, completed: [...this.completed], values, saved: new Date().toISOString() };
      if (this.model.baseline !== null) draft.baseline = this.model.baseline;
      if (this.preset) draft.preset = this.preset.id;
      return draft;
    },

    /** Saves the draft now; explicit saves say so. Nothing is saved while a found draft waits for the reader's choice. */
    async saveDraft(explicit) {
      const store = this.draftStore();
      clearTimeout(this.draftTimer);
      if (!store || this.draftPending || this.phase !== "form" || this.destroyed) return false;
      const answer = await this.hook("draftStore.save", () => store.save(this.model.id, this.draftDocument()));
      if (answer.failed || this.destroyed) { if (explicit) this.announce(this.labels.flowDraftFailed); return false; }
      if (explicit) { this.announce(this.labels.flowDraftSaved); this.noteDraft(this.labels.flowDraftSaved); }
      return true;
    },
    noteDraft(text) {
      let note = this.head.querySelector(".cx-flow-draft-note");
      if (!note) { note = h("p", "cx-flow-draft-note"); this.head.appendChild(note); }
      setText(note, text);
    },
    /** Answers or the step changed: the draft is saved a moment later. */
    draftChanged(now) {
      if (!this.draftStore() || this.draftPending) return;
      clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => this.saveDraft(false), now ? 0 : FLOW_DRAFT_DELAY);
    },
    /** A saved or accepted proposal ends the draft. */
    draftSettled(answer) {
      const store = this.draftStore();
      if (store && (answer.status === "saved" || answer.status === "accepted")) { clearTimeout(this.draftTimer); this.hook("draftStore.clear", () => store.clear(this.model.id)); }
    },

    /** Looks for a draft and, when there is one, offers to resume it. */
    async loadDraft() {
      const store = this.draftStore();
      if (!store) return;
      this.draftPending = true;
      const answer = await this.hook("draftStore.load", () => store.load(this.model.id)), draft = answer.value;
      if (this.destroyed) return;
      if (answer.failed || !flowIs(draft) || draft.kind !== "flowDraft" || draft.version !== 1 || draft.flow !== this.model.id || !flowIs(draft.values)) { this.draftPending = false; return; }
      const labels = this.labels, banner = this.resumeBanner = h("div", "cx-flow-resume"), text = h("p", "cx-flow-banner-title"), resume = h("button", "cx-flow-btn cx-primary"), restart = h("button", "cx-flow-btn");
      banner.setAttribute("role", "region"); banner.setAttribute("aria-label", labels.flowDraftFound);
      setText(text, fill(labels.flowDraftFrom, { time: typeof draft.saved === "string" ? flowDate(this, draft.saved, { dateStyle: "medium", timeStyle: "short" }) : "" }));
      banner.appendChild(text);
      // Another baseline means the settings changed after the draft was saved.
      if ((draft.baseline ?? null) !== this.model.baseline) { const stale = h("p", "cx-flow-banner-warn"); setText(stale, labels.flowDraftStale); banner.appendChild(stale); banner.classList.add("cx-flow-resume-stale"); }
      resume.type = restart.type = "button"; setText(resume, labels.flowDraftResume); setText(restart, labels.flowDraftRestart);
      const tools = h("div", "cx-flow-resume-tools"); tools.append(resume, restart); banner.appendChild(tools);
      resume.addEventListener("click", () => this.resumeDraft(draft).catch(error => this.report(error, "draft")));
      restart.addEventListener("click", () => { this.closeResume(); this.hook("draftStore.clear", () => store.clear(this.model.id)); });
      this.head.after(banner);
    },
    closeResume() {
      this.resumeBanner?.remove(); this.resumeBanner = null; this.draftPending = false;
      (this.stage.querySelector(".cx-flow-step-title") || this.root).focus?.({ preventScroll: true });
    },
    async resumeDraft(draft) {
      // Answers that no longer fit their field (the document changed since) are left out.
      for (const [id, value] of Object.entries(draft.values)) {
        const field = this.model.fields.get(id);
        if (!field || field.type === "secret" || !flowFits(field, value)) continue;
        this.assign(id, value); this.fields.get(id)?.mount(flowCopy(value));
      }
      this.preset = [...this.model.presets, ...this.userPresets || []].find(preset => preset.id === draft.preset) || null;
      this.closeResume();
      await this.setState({ step: draft.step, completed: Array.isArray(draft.completed) ? draft.completed.filter(id => typeof id === "string") : [] });
      this.markPreset();
    },

    // ---------- presets ----------
    /** The review page's line: the preset the answers started from, and how many changed since. */
    reviewPreset(section) {
      if (!this.preset) return;
      const line = h("p", "cx-flow-preset-line"), count = this.presetChanges();
      setText(line, fill(plural(this.labels.flowPresetChanges, count, this.lang), { preset: this.preset.label, count }));
      section.appendChild(line);
    },
    buildPresets() {
      const store = this.hooks.presetStore;
      if (!this.model.presets.length && !(store && typeof store.list === "function")) return;
      const labels = this.labels, bar = this.presetBar = h("div", "cx-flow-presets"), label = h("label", "cx-flow-presets-label"), select = this.presetSelect = h("select", "cx-flow-input cx-flow-preset");
      select.id = this.id + "-preset"; label.htmlFor = select.id; setText(label, labels.flowStartFrom);
      select.addEventListener("change", () => this.applyPreset(select.value || null), { signal: this.lifetime.signal });
      bar.append(label, select);
      if (store && typeof store.save === "function") {
        const save = h("button", "cx-flow-link"); save.type = "button"; setText(save, labels.flowPresetSave);
        save.addEventListener("click", () => this.askPresetName(), { signal: this.lifetime.signal });
        bar.appendChild(save);
      }
      this.head.appendChild(bar);
      this.fillPresets();
    },
    fillPresets() {
      const select = this.presetSelect;
      if (!select) return;
      const option = (value, text) => { const item = h("option"); item.value = value; setText(item, text); return item; };
      const groups = [option("", this.model.initial ? this.labels.flowPresetCurrent : this.labels.flowPresetNone), ...this.model.presets.map(preset => option(preset.id, preset.label))];
      if (this.userPresets?.length) { const group = h("optgroup"); group.label = this.labels.flowPresetsSaved; group.append(...this.userPresets.map(preset => option(preset.id, preset.label))); groups.push(group); }
      select.replaceChildren(...groups);
      select.value = this.preset?.id ?? "";
    },
    async loadPresets() {
      const store = this.hooks.presetStore;
      if (!store || typeof store.list !== "function") return;
      const answer = await this.hook("presetStore.list", () => store.list(this.model.id));
      if (this.destroyed || answer.failed || !Array.isArray(answer.value)) return;
      // A stored preset is read as strictly as the document's; one that no longer fits the flow is left out.
      this.userPresets = answer.value.slice(0, 100).map(raw => { try { return flowPreset(raw, this.model); } catch (error) { this.report(error, "presetStore.list"); return null; } })
        .filter(preset => preset && !this.model.presets.some(own => own.id === preset.id));
      this.fillPresets();
    },
    presetBase(field) { return this.preset && Object.hasOwn(this.preset.values, field.id) ? this.preset.values[field.id] : this.startValues.get(field.id) ?? null; },

    /** Starts from a preset: the starting answers with the preset's on top. null goes back to the plain start. */
    /** api.setPreset: the preset's answers, or none (null). */
    setPreset(id) { this.applyPreset(id ?? null); },
    applyPreset(id) {
      const preset = id === null ? null : [...this.model.presets, ...this.userPresets || []].find(item => item.id === id);
      if (id !== null && !preset) flowFail("there is no preset '" + id + "'");
      this.preset = preset;
      for (const field of [...this.model.fields.values()]) {
        if (field.type === "secret" || !this.values.has(field.id)) continue;
        const value = this.presetBase(field);
        if (!flowSameValue(this.values.get(field.id) ?? null, value)) this.setAnswer(field, value, "preset");
      }
      if (this.presetSelect) this.presetSelect.value = preset?.id ?? "";
      this.markPreset(); this.refreshReview(); this.draftChanged();
      this.announce(preset ? fill(this.labels.flowPresetApplied, { preset: preset.label }) : this.model.initial ? this.labels.flowPresetCurrent : this.labels.flowPresetNone);
    },
    /** The quiet "changed" marks: answers that differ from the preset the reader started from. */
    markPreset() {
      for (const fv of this.fields.values()) flowMark(this, fv, !!this.preset && fv.field.type !== "secret" && !flowSameValue(flowNormal(this.values.get(fv.field.id)), flowNormal(this.presetBase(fv.field))));
    },
    presetChanges() {
      return [...this.model.fields.values()].filter(field => field.type !== "secret" && this.visible(field) && !flowSameValue(flowNormal(this.values.get(field.id)), flowNormal(this.presetBase(field)))).length;
    },

    /** Saving the answers as a preset: a name, then the host's presetStore.save. */
    askPresetName() {
      if (this.presetBar.querySelector("input")) { this.presetBar.querySelector("input").focus(); return; }
      const labels = this.labels, name = h("input", "cx-flow-input"), save = h("button", "cx-flow-btn"), cancel = h("button", "cx-flow-btn cx-flow-quiet"), box = h("div", "cx-flow-preset-name");
      name.type = "text"; name.maxLength = 200; name.setAttribute("aria-label", labels.flowPresetName); name.placeholder = labels.flowPresetName;
      save.type = cancel.type = "button"; setText(save, labels.flowPresetSave); setText(cancel, labels.flowCancel);
      cancel.addEventListener("click", () => box.remove());
      const store = async () => {
        const label = name.value.trim();
        if (!label) { name.focus(); return; }
        const values = {};
        for (const [id, value] of Object.entries(this.getValues())) if (!this.model.fields.get(id).sensitive) values[id] = value;
        const preset = { id: "saved-" + Date.now().toString(36), label, values };
        const answer = await this.hook("presetStore.save", () => this.hooks.presetStore.save(this.model.id, preset));
        if (answer.failed) { this.announce(labels.flowPresetFailed); return; }
        box.remove(); await this.loadPresets();
        if (this.userPresets?.some(item => item.id === preset.id)) { this.preset = this.userPresets.find(item => item.id === preset.id); this.fillPresets(); this.markPreset(); }
        this.announce(fill(labels.flowPresetSaved, { preset: label }));
      };
      save.addEventListener("click", () => store().catch(error => this.report(error, "presetStore.save")));
      name.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); store().catch(error => this.report(error, "presetStore.save")); } });
      box.append(name, save, cancel);
      this.presetBar.appendChild(box);
      name.focus();
    }
  });
