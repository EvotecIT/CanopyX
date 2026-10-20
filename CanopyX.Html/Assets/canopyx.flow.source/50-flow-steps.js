  // ---------- flow: steps on the page and moving between them ----------
  // A form step is built once and kept, so its inputs (and what the reader typed) survive going back and forth; fields and
  // sections show and hide as answers change. On a step change focus moves to the step's heading and a polite live region
  // says where the reader is. Next validates the step first; Back never validates; a linear flow opens a step only once the
  // steps before it are complete.
  Object.assign(FlowView.prototype, {
    renderStage() {
      const step = this.step;
      if (this.phase === "result" || this.phase === "progress") { this.stage.replaceChildren(this.panel); return; }
      // The review page is built when it opens and kept while only the layout changes, so its checks run once per visit.
      if (step.type === "review") {
        if (this.reviewStale || !this.reviewNode) { this.reviewNode = this.reviewSection(); this.reviewStale = false; }
        if (this.stage.firstChild !== this.reviewNode) this.stage.replaceChildren(this.reviewNode);
        return;
      }
      let section = this.sections.get(step.id);
      if (!section) { section = step.type === "info" ? this.stepShell(step) : this.formSection(step); this.sections.set(step.id, section); }
      // A flow without a review page shows the host's error or conflict at the top of its last step.
      section.querySelector(":scope > .cx-flow-answer-banner")?.remove();
      if (this.banner && step === this.visibleSteps().at(-1)) section._cxSummary.after(this.answerBanner());
      if (this.stage.childNodes.length !== 1 || this.stage.firstChild !== section) this.stage.replaceChildren(section);
    },

    /** The heading, description and error summary every step starts with. */
    stepShell(step) {
      const section = h("section", "cx-flow-step"), heading = h("h3", "cx-flow-step-title");
      heading.id = this.id + "-s-" + step.id; heading.tabIndex = -1;
      setText(heading, step.title || this.labels.flowReviewTitle);
      section.setAttribute("aria-labelledby", heading.id);
      section.appendChild(heading);
      if (step.description) { const description = h("p", "cx-flow-step-desc"); setText(description, step.description); section.appendChild(description); }
      const summary = h("div", "cx-flow-summary");
      summary.setAttribute("role", "alert"); summary.tabIndex = -1; summary.hidden = true;
      section.appendChild(summary);
      section._cxHeading = heading; section._cxSummary = summary;
      return section;
    },

    formSection(step) {
      const section = this.stepShell(step);
      section._cxBlocks = [];
      for (const block of step.blocks) {
        const element = h("div", block.section ? "cx-flow-section" : "cx-flow-block"), grid = h("div", "cx-flow-grid");
        if (block.section) {
          const title = h("h4", "cx-flow-section-title");
          title.id = this.id + "-x-" + block.section.id; setText(title, block.section.label);
          element.setAttribute("role", "group"); element.setAttribute("aria-labelledby", title.id);
          element.appendChild(title);
          if (block.section.description) { const description = h("p", "cx-flow-section-desc"); setText(description, block.section.description); element.appendChild(description); }
        }
        for (const field of block.fields) {
          const fv = flowFieldView(this, field);
          this.fields.set(field.id, fv);
          fv.mount(field.type === "secret" ? null : flowCopy(this.values.get(field.id) ?? null));
          fv.element.hidden = !this.visible(field);
          if (this.errors.has(field.id)) fv.message(this.errors.get(field.id));
          grid.appendChild(fv.element);
        }
        element.appendChild(grid);
        element.hidden = !block.fields.some(field => this.visible(field));
        section._cxBlocks.push({ element, fields: block.fields });
        section.appendChild(element);
      }
      return section;
    },

    /** Moves to a step: the cancelable flowStepChanging first, then the page, focus and the announcement. */
    async go(target, direction, quiet) {
      if (!target || this.destroyed) return false;
      const from = this.step, generation = this.generation;
      if (target !== from && !this.emit("flowStepChanging", { from: from.id, to: target.id, direction }, null, true)) return false;
      if (this.destroyed || this.generation !== generation || this.step !== from) return false;
      for (const fv of this.fields.values()) fv.instance?.conceal?.();
      this.step = target; this.reviewStale = true;
      // Checks made elsewhere (the review page) left messages the rail counts; the step shows the same ones.
      for (const field of target.blocks?.flatMap(block => block.fields) || []) this.fields.get(field.id)?.message(this.errors.get(field.id) ?? null);
      this.render();
      const steps = this.visibleSteps(), heading = this.stage.querySelector(".cx-flow-step-title");
      if (!quiet) {
        heading?.focus({ preventScroll: true });
        this.root.scrollIntoView?.({ block: "nearest" });
        this.announce(fill(this.labels.flowStepAnnounce, { current: steps.indexOf(target) + 1, count: steps.length, title: target.title || this.labels.flowReviewTitle }));
      }
      if (target !== from) this.emit("flowStepChanged", { from: from.id, to: target.id }, "onStepChange");
      return true;
    },

    async next() {
      if (this.busy || this.phase !== "form") return false;
      const step = this.step, steps = this.visibleSteps(), pressed = document.activeElement, generation = this.generation;
      if (step.type === "form") {
        const ticket = this.beginOperation();
        this.renderActions();
        let result;
        try {
          result = await ticket.wait(this.validateStep(step, true, ticket.current));
          if (!ticket.current()) return false;
        } finally { if (ticket.current()) this.retireOperation(); }
        // An answer changed while Next checked the step: the reader is still working on it, so the step stays.
        if (this.destroyed || generation !== this.generation || this.step !== step || result.moved) return false;
        if (!result.valid) {
          // The summary takes focus only when the reader is still where Next left them, never from a field they moved on to.
          const stayed = document.activeElement === pressed || !this.root.contains(document.activeElement);
          this.renderRail(); this.renderActions(); this.showSummary(step, stayed);
          return false;
        }
        const summary = this.sections.get(step.id)?._cxSummary;
        if (summary) summary.hidden = true;
        this.completed.add(step.id);
      } else this.completed.add(step.id);
      const review = this.reviewStep();
      const target = this.returnToReview && review && this.stepVisible(review) ? review : steps[steps.indexOf(step) + 1];
      if (target === review) this.returnToReview = false;
      return this.go(target, "forward");
    },

    async back() {
      if (this.busy || this.phase !== "form") return false;
      const steps = this.visibleSteps(), at = steps.indexOf(this.step);
      return at > 0 ? this.go(steps[at - 1], "back") : false;
    },

    /** Opens a visible step; in a linear flow a later step than the first incomplete one opens that step instead. */
    async goTo(id) {
      if (this.busy || this.phase !== "form") return false;
      const steps = this.visibleSteps(), target = steps.find(step => step.id === id);
      if (!target) return false;
      const open = this.reachable(target, steps) ? target : steps.find(step => step.type === "form" && !this.completed.has(step.id)) || target;
      return this.go(open, steps.indexOf(open) < steps.indexOf(this.step) ? "back" : "forward");
    },

    /** Opens a step from the review page; its Next returns to the review page. */
    change(field) {
      this.returnToReview = true;
      return this.go(field.step, "back").then(moved => {
        if (moved) { const fv = this.fields.get(field.id); if (fv) fv.focus(); }
        return moved;
      });
    }
  });
