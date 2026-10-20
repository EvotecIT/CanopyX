  // ---------- flow: the layout, the step rail and the action bar (docs/flow.md#layouts) ----------
  // Wide hosts show a rail of numbered steps above (horizontal) or beside (vertical) the form; narrow hosts (below 640 px)
  // stack the steps and open the current one under its title. Only the current step uses the accent; complete steps carry a
  // quiet check and steps with errors a count. The rail is a nav with an ordered list; the stacked steps are a plain list.
  const FLOW_NARROW = 640;

  Object.assign(FlowView.prototype, {
    build() {
      const root = this.root = h("div", "cx-flow"), head = h("header", "cx-flow-head"), title = h("h2", "cx-flow-title");
      root.dataset.cxDensity = this.model.density;
      setText(title, this.model.title); title.id = this.id + "-title"; head.appendChild(title);
      if (this.model.description) { const description = h("p", "cx-flow-desc"); setText(description, this.model.description); head.appendChild(description); }
      root.setAttribute("aria-labelledby", title.id); root.setAttribute("role", "group");
      this.layout = h("div", "cx-flow-layout");
      this.rail = h("div", "cx-flow-rail"); this.railList = h("ol", "cx-flow-marks"); this.rail.appendChild(this.railList);
      this.main = h("div", "cx-flow-main"); this.stage = h("div", "cx-flow-stage"); this.actions = h("div", "cx-flow-actions");
      this.main.append(this.stage, this.actions);
      this.live = h("div", "cx-sr-only"); this.live.setAttribute("aria-live", "polite");
      this.layout.append(this.rail, this.main);
      root.append(head, this.layout, this.live);
      this.head = head;
      // A dialog or drawer flow opens from a launch button in the host (the flow-dialog part); an inline flow sits in the host.
      if (this.model.container !== "inline") this.buildContainer(); else this.host.appendChild(root);
      this.sizer = this.dialog || this.host;
      const signal = this.lifetime.signal;
      root.addEventListener("input", event => this.fieldEvent(event, "edit"), { signal });
      root.addEventListener("change", event => this.fieldEvent(event, "edit"), { signal });
      root.addEventListener("focusout", event => this.fieldEvent(event, "blur"), { signal });
      root.addEventListener("keydown", event => this.key(event), { signal });
      this.narrow = false;
      if (global.ResizeObserver) { this.resize = new ResizeObserver(() => this.measure()); this.resize.observe(this.sizer); }
      this.buildPresets?.();
      this.measure(true);
      this.render();
      this.startHostFeatures?.();
    },

    fieldEvent(event, source) {
      const wrapper = event.target.closest?.("[data-cx-field]");
      const field = wrapper && this.model.fields.get(wrapper.dataset.cxField);
      if (!field || this.phase !== "form") return;
      // Leaving a field checks it; leaving one input of a group for another input of the same group does not.
      if (source === "blur") { if (wrapper.contains(event.relatedTarget)) return; this.changed(field, "blur"); this.checkField(field); return; }
      this.changed(field, source);
    },

    measure(first) {
      const width = this.sizer.clientWidth || global.innerWidth, narrow = width < FLOW_NARROW;
      if (!first && width === this.width) return;
      // A wider host may fit the horizontal rail an automatic orientation gave up on; a narrower one may not fit it any more.
      const changed = narrow !== this.narrow || this.railTooWide && width > this.width;
      this.width = width; this.narrow = narrow;
      if (changed) { this.railTooWide = false; if (!first) this.render(); }
      else if (!first) this.fitRail();
    },

    /** The orientation in use: the stacked steps on narrow hosts, else the document's; auto takes the horizontal rail for up
     * to six steps whose titles fit the width, and the vertical rail otherwise. */
    orientation() {
      // A flow of one step needs no rail; its heading says what the step asks.
      if (this.visibleSteps().length <= 1) return "single";
      if (this.narrow) return "stack";
      return this.model.orientation === "auto" ? (this.visibleSteps().length > 6 || this.railTooWide ? "vertical" : "horizontal") : this.model.orientation;
    },

    /** An automatic horizontal rail whose step titles do not fit turns vertical rather than cutting them off. */
    fitRail() {
      if (this.model.orientation !== "auto" || this.railTooWide || this.orientation() !== "horizontal" || !this.rail.clientWidth) return;
      if (this.rail.scrollWidth > this.rail.clientWidth + 1) { this.railTooWide = true; this.render(); }
    },
    render() {
      // A repaint that moves the step (the stacked layout) keeps the reader's focus where it was.
      const active = document.activeElement;
      // An answer that hides the current step moves the reader to the next visible step (or the last) before anything paints.
      const steps = this.visibleSteps();
      if (this.phase === "form" && this.step !== this.hub && !steps.includes(this.step)) {
        const from = this.step;
        this.step = steps.find(step => this.model.steps.indexOf(step) > this.model.steps.indexOf(from)) || steps[steps.length - 1];
        this.reviewStale = true;
        this.emit("flowStepChanged", { from: from.id, to: this.step.id }, "onStepChange");
      }
      const orientation = this.orientation();
      this.layout.className = "cx-flow-layout cx-flow-" + orientation;
      this.root.classList.toggle("cx-flow-narrow", this.narrow);
      // Only the horizontal and vertical rails are a navigation; a task list has its hub instead (the flow-tasks part).
      if (orientation === "horizontal" || orientation === "vertical") { this.rail.setAttribute("role", "navigation"); this.rail.setAttribute("aria-label", this.labels.flowSteps); }
      else { this.rail.removeAttribute("role"); this.rail.removeAttribute("aria-label"); }
      this.renderStage();
      this.renderRail();
      this.renderActions();
      if (active && active !== document.activeElement && active.isConnected && this.root.contains(active)) active.focus({ preventScroll: true });
      this.fitRail();
    },

    /** One state for a visible step: current, complete, error, locked or incomplete. */
    stepState(step, steps) {
      if (this.phase !== "form") return "complete";
      if (step === this.step) return "current";
      const errors = this.stepErrorCount(step);
      if (errors) return "error";
      if (this.completed.has(step.id)) return "complete";
      return this.reachable(step, steps) ? "incomplete" : "locked";
    },
    reachable(step, steps = this.visibleSteps()) {
      if (this.model.mode === "free") return true;
      for (const before of steps) { if (before === step) return true; if (before.asks && !this.completed.has(before.id)) return false; }
      return false;
    },

    renderRail() {
      if (!this.root) return;
      // A task list shows its hub instead (the flow-tasks part).
      const steps = this.visibleSteps(), stack = this.orientation() === "stack", labels = this.labels;
      if (!steps.includes(this.step)) this.step = steps.find(step => this.model.steps.indexOf(step) > this.model.steps.indexOf(this.step)) || steps[steps.length - 1];
      // The items stay while the visible steps stay, so a repaint during a click (a field checked as focus leaves it) never
      // moves the button being clicked or the stacked step that holds it.
      const key = steps.map(step => step.id).join() + (stack ? "|stack" : "");
      if (key !== this.railKey) {
        this.railKey = key; this.railItems = new Map();
        this.railList.replaceChildren(...steps.map(step => {
          const item = h("li", "cx-flow-mark"), button = h("button", "cx-flow-mark-btn");
          button.type = "button";
          button.addEventListener("click", () => { if (button.getAttribute("aria-disabled") !== "true" && step !== this.step) this.goTo(step.id).catch(error => this.report(error, "goTo")); });
          item.appendChild(button); this.railItems.set(step.id, item);
          return item;
        }));
      }
      steps.forEach((step, index) => {
        const state = this.stepState(step, steps), item = this.railItems.get(step.id), button = item.firstChild, number = h("span", "cx-flow-num");
        const text = h("span", "cx-flow-mark-text"), title = h("span", "cx-flow-mark-title"), note = h("span", "cx-flow-mark-state");
        item.dataset.cxState = state;
        setText(number, state === "complete" ? "✓" : state === "error" ? "!" : String(index + 1));
        number.setAttribute("aria-hidden", "true");
        setText(title, step.title || labels.flowReviewTitle);
        const errors = this.stepErrorCount(step);
        setText(note, state === "current" ? labels.flowStepCurrent : state === "error" ? fill(labels.flowStepErrors, { count: errors }) :
          state === "complete" ? labels.flowStepComplete : state === "locked" ? labels.flowStepLocked : step.optional ? labels.flowStepOptional : labels.flowStepNotStarted);
        note.className = "cx-flow-mark-state" + (state === "locked" || state === "incomplete" ? " cx-sr-only" : "");
        text.append(title, note);
        // Unchanged content stays: a press that started on it still ends in a click.
        const signature = state + "\u0000" + number.textContent + "\u0000" + note.textContent + "\u0000" + title.textContent;
        if (button._cxSignature !== signature) { button._cxSignature = signature; button.replaceChildren(number, text); }
        if (state === "current") button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
        if (state === "locked" || this.phase !== "form") button.setAttribute("aria-disabled", "true"); else button.removeAttribute("aria-disabled");
        if (stack && step === this.step && this.phase === "form" && this.main.parentNode !== item) item.appendChild(this.main);
      });
      if (!stack && this.main.parentNode !== this.layout) this.layout.appendChild(this.main);
      if (stack && this.phase !== "form") this.railList.after(this.main);
    },

    /** Whether the current step submits: the last visible step (a task list's review page, in the flow-tasks part). */
    lastStep() { const steps = this.visibleSteps(); return steps.indexOf(this.step) === steps.length - 1; },

    renderActions() {
      const labels = this.labels, at = this.visibleSteps().indexOf(this.step), last = this.lastStep();
      this.actions.replaceChildren();
      this.actions.hidden = this.phase !== "form";
      if (this.phase !== "form") return;
      const back = h("button", "cx-flow-btn cx-flow-back"), next = h("button", "cx-flow-btn cx-primary cx-flow-next");
      back.type = next.type = "button";
      setText(back, labels.flowBack); back.hidden = at <= 0;
      back.addEventListener("click", () => this.back().catch(error => this.report(error, "back")));
      setText(next, last ? this.model.submitLabel || labels.flowSubmit : labels.flowNext);
      next.addEventListener("click", () => (last ? this.submit() : this.next()).catch(error => this.report(error, last ? "submit" : "next")));
      if (this.busy) { next.disabled = back.disabled = true; next.setAttribute("aria-busy", "true"); if (last) setText(next, labels.flowSubmitting); }
      const spacer = h("span", "cx-flow-spacer");
      // Save draft and Cancel sit in a quiet group beside Back (the flow-drafts and flow-dialog parts).
      this.actions.append(back, ...[this.draftButton?.(), this.cancelButton?.()].filter(Boolean), spacer, next);
    },

    key(event) {
      if (event.defaultPrevented || event.isComposing || this.phase !== "form") return;
      const target = event.target;
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && this.step.type === "review") { event.preventDefault(); this.submit().catch(error => this.report(error, "submit")); return; }
      // Enter in a single-line field moves on; text areas, lists, buttons and open suggestion lists keep their own Enter.
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.shiftKey || target.tagName !== "INPUT" || /^(button|submit|checkbox|radio|file)$/.test(target.type) ||
          target.closest(".cx-flow-list,.cx-flow-records,.cx-flow-pick,.cx-flow-confirm") || !target.closest(".cx-flow-stage")) return;
      event.preventDefault();
      (this.lastStep() ? this.submit() : this.next()).catch(error => this.report(error, "next"));
    },

    announce(text) { setText(this.live, ""); setTimeout(() => setText(this.live, text), 30); }
  });
