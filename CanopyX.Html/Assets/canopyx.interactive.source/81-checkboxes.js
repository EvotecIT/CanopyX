
  // The interactive entry point owns checking. The ordinary tree runtime does not pay for this state or UI.
  TreeGrid = class extends TreeGrid {
    constructor(host, options) {
      const mode = options.view && options.view.checkboxes;
      if (mode !== undefined && mode !== "independent" && mode !== "hierarchical") throw new Error("CanopyX: unknown checkbox mode.");
      if (!mode && options.view && options.view.checkIntents !== undefined) throw new Error("CanopyX: checking intents require checkboxes.");
      if (mode) new CheckIntents(options.view.checkIntents === undefined ? [] : options.view.checkIntents, mode);
      for (const name of ["isCheckable", "beforeCheck", "onCheck"]) {
        if (options[name] !== undefined && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
      }
      super(host, options);
    }

    async init() {
      this.checkMode = this.view.checkboxes || null;
      this.checkRevision = 0;
      this.checks = new CheckIntents(this.view.checkIntents === undefined ? [] : this.view.checkIntents, this.checkMode);
      await super.init();
      this.paintCheckedRows();
    }

    interactionApi() {
      return {
        getCheckState: id => {
          const w = this.keyMap.get(id);
          return !this.destroyed && this.checkMode && w && !w.status && !w.h.detail ? this.checks.state(this.pathOf(w)) : null;
        },
        getCheckIntents: () => !this.destroyed && this.checkMode ? this.checks.snapshot() : [],
        setChecked: (id, checked) => this.setChecked(id, checked),
        setCheckIntents: items => this.setCheckIntents(items)
      };
    }

    canCheck(w) {
      return !!this.checkMode && !w.status && !w.h.detail && !w._invalidated &&
        (!this.opts.isCheckable || this.opts.isCheckable(w.h) !== false);
    }

    checkSnapshot(model) {
      return Object.freeze(model.snapshot().map(item => Object.freeze({ path: Object.freeze(item.path), checked: item.checked })));
    }

    voteCheck(next, w, reason, revision) {
      const intents = this.checkSnapshot(next), previous = this.checkSnapshot(this.checks);
      const node = w ? w.h : null, context = Object.freeze({ previous, reason });
      if (this.opts.beforeCheck) {
        const decision = this.opts.beforeCheck(node, intents, context);
        if (decision && typeof decision.then === "function") {
          Promise.resolve(decision).catch(() => {});
          throw new Error("CanopyX: beforeCheck must return synchronously.");
        }
        if (decision === false) return false;
      }
      const event = new CustomEvent("canopyx:beforecheck", { bubbles: true, cancelable: true,
        detail: Object.freeze({ node, intents, previous, reason }) });
      return this.host.dispatchEvent(event) && !this.destroyed && revision === this.checkRevision &&
        (!w || !w._invalidated && this.keyMap.get(w.key) === w && this.canCheck(w)) && revision === this.checkRevision;
    }

    commitCheck(next, w, reason, revision) {
      if (!this.voteCheck(next, w, reason, revision)) return false;
      this.checks = next;
      this.checkRevision++;
      this.paintCheckedRows();
      this.stateChanged();
      this.notifyCheck(w, reason);
      return true;
    }

    notifyCheck(w, reason) {
      const model = this.checks;
      const detail = Object.freeze({ node: w ? w.h : null, intents: this.checkSnapshot(model), reason });
      if (this.opts.onCheck) this.opts.onCheck(detail.node, detail.intents, { reason });
      if (!this.destroyed && this.checks === model) this.emit("check", detail);
    }

    setCheckIntents(items) {
      if (this.destroyed || !this.checkMode || this.initializing || this.restoring) return false;
      const revision = this.checkRevision;
      return this.commitCheck(new CheckIntents(items, this.checkMode), null, "api", revision);
    }

    setChecked(id, checked, reason) {
      if (typeof checked !== "boolean") throw new Error("CanopyX: checked must be a boolean.");
      if (this.destroyed || !this.checkMode || this.initializing || this.restoring) return false;
      const revision = this.checkRevision, w = this.keyMap.get(id);
      if (!w || !this.canCheck(w) || revision !== this.checkRevision) return false;
      let next = this.checks.with(this.pathOf(w), checked);
      if (this.checkMode === "hierarchical") {
        // A complete loaded sibling set can become one branch intent. Partial pages never claim unseen siblings.
        for (let parent = w.parent; parent && parent !== this.root; parent = parent.parent) {
          if (!parent.children || parent.next || !parent.children.length || parent.total != null && parent.total !== parent.children.length ||
              parent.children.some(child => child.h.detail)) break;
          const values = parent.children.map(child => next.state(this.pathOf(child)));
          if (values.some(value => value === "mixed") || !values.every(value => value === values[0])) break;
          next = next.with(this.pathOf(parent), values[0]);
        }
      }
      return this.commitCheck(next, w, reason || "api", revision);
    }

    toggleCheck(w, reason) {
      return this.setChecked(w.key, this.checks.state(this.pathOf(w)) !== true, reason);
    }

    paintTreeSlot(slot, w) {
      super.paintTreeSlot(slot, w);
      if (!this.checkMode) return;
      if (!slot.check) {
        slot.check = h("input", "cx-check");
        slot.check.type = "checkbox";
        slot.check.tabIndex = -1;
        slot.cell.insertBefore(slot.check, slot.content);
      }
      this.paintCheck(slot.check, w);
    }

    paintCheck(input, w) {
      const value = this.checks.state(this.pathOf(w));
      input.checked = value === true;
      input.indeterminate = value === "mixed";
      setAttr(input, "aria-checked", value === "mixed" ? "mixed" : String(value));
      setAttr(input, "aria-label", w.h.label);
      input.disabled = this.initializing || this.restoring || !this.canCheck(w);
    }

    paintCheckedRows() {
      if (this.destroyed || !this.checkMode) return;
      for (const [w, row] of this.rendered) {
        const input = row._kind === "node" && row._cells[0].check;
        if (input) this.paintCheck(input, w);
      }
    }

    onClick(event) {
      if (!event.defaultPrevented && event.target.classList.contains("cx-check")) {
        event.preventDefault();
        event.stopPropagation();
        const w = this.rowFromEvent(event);
        if (w) { this.setFocus(w, false); this.toggleCheck(w, "pointer"); this.scheduleRender(); }
        return;
      }
      super.onClick(event);
    }

    onKey(event) {
      const row = event.target.closest(".cx-row");
      if (!event.defaultPrevented && !event.isComposing && this.checkMode && row === event.target && event.key === " " &&
          !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
          !(this.typeBuf && performance.now() - this.typeAt <= TYPEAHEAD_MS)) {
        event.preventDefault();
        event.stopPropagation();
        const w = this.rowFromEvent(event);
        if (w && !w.status && !w.h.detail) this.toggleCheck(w, "keyboard");
        return;
      }
      super.onKey(event);
    }

    getState() {
      const state = super.getState();
      if (this.checkMode) { state.checkboxes = this.checkMode; state.checkIntents = this.checks.snapshot(); }
      return state;
    }

    toOutline() {
      const model = this.checks, items = this.rows.filter(w => !w.status).map(w =>
        ({ path: this.pathOf(w), label: w.h.label, detail: !!w.h.detail }));
      const markup = super.toOutline();
      if (!this.checkMode) return markup;
      const holder = h("div");
      holder.innerHTML = markup;
      const rows = holder.querySelector("table").tBodies[0].rows;
      items.forEach((item, index) => {
        if (item.detail) return;
        const value = model.state(item.path), marker = h("span");
        marker.setAttribute("role", "checkbox");
        marker.setAttribute("aria-readonly", "true");
        marker.setAttribute("aria-label", item.label);
        marker.setAttribute("aria-checked", value === "mixed" ? "mixed" : String(value));
        marker.style.marginRight = "6px";
        marker.textContent = value === "mixed" ? "▣ " : value ? "☑ " : "☐ ";
        rows[index].cells[0].prepend(marker);
      });
      return holder.innerHTML;
    }

    readState(state) {
      const result = super.readState(state);
      if (!result || !result.version) return result;
      if (state.checkboxes !== undefined && state.checkboxes !== this.checkMode) return null;
      try {
        if (this.checkMode) {
          result.checkboxes = this.checkMode;
          result.checkIntents = new CheckIntents(state.checkIntents === undefined ? [] : state.checkIntents, this.checkMode).snapshot();
        } else if (state.checkIntents !== undefined && (!Array.isArray(state.checkIntents) || state.checkIntents.length)) return null;
        return result;
      } catch (error) { return null; }
    }

    async setState(state) {
      const parsed = this.readState(state);
      if (!parsed || this.destroyed) return false;
      const revision = ++this.checkRevision;
      if (parsed.checkIntents && !this.voteCheck(new CheckIntents(parsed.checkIntents, this.checkMode), null, "restore", revision)) return false;
      const operation = super.setState(parsed);
      const generation = this.restoreGeneration;
      this.paintCheckedRows();
      try {
        const accepted = await operation;
        if (accepted && this.checkMode && !this.destroyed && generation === this.restoreGeneration) this.notifyCheck(null, "restore");
        return accepted;
      }
      finally { this.paintCheckedRows(); }
    }

    applyStatePresentation(state) {
      super.applyStatePresentation(state);
      if (state.checkIntents) { this.checks = new CheckIntents(state.checkIntents, this.checkMode); this.checkRevision++; }
    }

    destroy() {
      this.checkRevision++;
      super.destroy();
      this.checks = null;
    }
  };
