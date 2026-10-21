  // ---------- flow: the review page (docs/flow.md#the-review-page) ----------
  // One summary list per visible step with each answer and a Change button whose accessible name says what it changes. A
  // banner says whether the answers are ready or how many problems remain; edit mode shows what each changed answer was and,
  // by default, only the changed answers. The declaration sits above the submit button. Nothing here is HTML from the host.
  const flowNormal = value => flowEmpty(value) ? null : value;

  Object.assign(FlowView.prototype, {
    /** The edit-mode answer a field started from, or null in create mode and for fields the settings did not hold. */
    initialOf(field) { return this.model.initial && Object.hasOwn(this.model.initial, field.id) ? this.model.initial[field.id] : null; },
    /** Whether a visible field's answer differs from the edited settings (a typed secret always does). */
    isChanged(field) {
      if (field.type === "secret") return this.secrets.has(field.id);
      return !flowSameValue(flowNormal(this.values.get(field.id)), flowNormal(this.initialOf(field)));
    },
    secretText(field) {
      return this.secrets.has(field.id) ? this.labels.flowSecretSet : this.keeps(field) ? this.labels.flowSecretKept : this.labels.flowSecretNotSet;
    },

    reviewSection() {
      const step = this.step, labels = this.labels, section = this.stepShell(step), edit = !!this.model.initial;
      section.classList.add("cx-flow-review");
      const status = h("div", "cx-flow-banner");
      status.setAttribute("role", "status");
      section.appendChild(status);
      if (this.banner) section.appendChild(this.answerBanner());
      let changesOnly = edit && (this.showAll === undefined ? step.changesOnly : !this.showAll);
      const lists = h("div", "cx-flow-review-lists"), tools = h("div", "cx-flow-review-tools");
      if (edit) {
        const toggle = h("label", "cx-flow-switch"), box = h("input"), text = h("span"), count = h("span", "cx-flow-count");
        box.type = "checkbox"; box.checked = changesOnly; box.setAttribute("role", "switch"); setText(text, labels.flowChangesOnly);
        box.addEventListener("change", () => { this.showAll = !box.checked; changesOnly = box.checked; this.fillReview(lists, changesOnly); });
        toggle.append(box, text);
        const changed = [...this.model.fields.values()].filter(field => this.visible(field) && this.isChanged(field)).length;
        setText(count, fill(labels.flowChangedCount, { count: changed }));
        tools.append(toggle, count);
        section.appendChild(tools);
      }
      section.appendChild(lists);
      this.fillReview(lists, changesOnly);
      // What the feature parts add: the preset line, the checks, the host's preview and the equivalent command.
      flowEach("review", this, section);
      if (step.declaration) { const declaration = h("p", "cx-flow-declaration"); setText(declaration, step.declaration); section.appendChild(declaration); }
      // A typed confirmation and an acknowledgement the conditions ask for sit right above the submit button (the flow-consent part).
      flowEach("confirm", this, section, step);
      // The checks run as the page opens, and again when a server check runs on it; the banner follows them, and the rail
      // shows the steps that need attention.
      const recheck = this.reviewRecheck = () => {
        const ticket = this.reviewTicket = {};
        setText(status, "…");
        // After the host answered with an error or a conflict, its banner speaks; the status shows only local problems.
        if (this.banner) status.hidden = true;
        this.reviewChecking = true;
        return this.validateAll().finally(() => { if (this.reviewTicket === ticket) this.reviewChecking = false; }).then(result => {
          if (this.reviewTicket !== ticket || this.destroyed) return;
          this.reviewResult = result;
          this.fillBanner(status, result);
          status.hidden = !!this.banner && result.valid;
          this.fillReview(lists, changesOnly);
          this.renderRail();
        }, error => this.report(error, "validate"));
      };
      recheck();
      return section;
    },

    fillBanner(status, result) {
      const labels = this.labels;
      status.replaceChildren();
      status.className = "cx-flow-banner " + (result.valid ? "cx-flow-ready" : "cx-flow-problems");
      const title = h("p", "cx-flow-banner-title");
      setText(title, result.valid ? labels.flowReady : fill(labels.flowNotReady, { count: result.errors.length }));
      status.appendChild(title);
      const list = h("ul", "cx-flow-banner-list");
      for (const error of result.errors) {
        const item = h("li"), step = this.model.steps.find(entry => entry.id === error.step), field = error.field && this.model.fields.get(error.field);
        if (step) {
          const link = h("button", "cx-flow-link");
          link.type = "button"; setText(link, (step.title ? step.title + ": " : "") + error.message);
          link.addEventListener("click", () => (field ? this.change(field) : (this.returnToReview = true, this.goTo(step.id))).catch(failure => this.report(failure, "goTo")));
          item.appendChild(link);
        } else setText(item, error.message);
        list.appendChild(item);
      }
      if (result.warnings.length) {
        const warnings = h("p", "cx-flow-banner-warn"); setText(warnings, fill(labels.flowWarnings, { count: result.warnings.length }));
        status.appendChild(warnings);
        for (const warning of result.warnings) { const item = h("li", "cx-flow-warning"); setText(item, warning.message); list.appendChild(item); }
      }
      if (list.children.length) status.appendChild(list);
    },

    /** The summary lists: one per visible form step, with each answer, what it was, its error and a Change button. */
    fillReview(lists, changesOnly) {
      const labels = this.labels;
      lists.replaceChildren();
      let shown = 0;
      for (const step of this.visibleSteps()) {
        if (!step.asks) continue;
        const fields = this.stepFields(step).filter(field => !changesOnly || this.isChanged(field));
        const stepMessage = this.stepErrors.get(step.id) || this.hostStepErrors.get(step.id);
        if (!fields.length && !stepMessage) continue;
        const group = h("section", "cx-flow-review-group"), heading = h("h4", "cx-flow-review-title"), list = h("dl", "cx-flow-answers");
        heading.id = this.id + "-r-" + step.id; setText(heading, step.title);
        group.setAttribute("aria-labelledby", heading.id);
        group.appendChild(heading);
        if (stepMessage) { const error = h("p", "cx-flow-error"); setText(error, stepMessage); group.appendChild(error); }
        for (const field of fields) {
          const row = h("div", "cx-flow-answer"), term = h("dt"), value = h("dd", "cx-flow-answer-value"), action = h("dd", "cx-flow-answer-action");
          setText(term, field.label);
          const current = field.type === "secret" ? this.secretText(field) : flowDisplay(this, field, this.values.get(field.id) ?? null), now = h("span", "cx-flow-now");
          setText(now, current);
          if (flowEmpty(this.values.get(field.id)) && field.type !== "secret") now.classList.add("cx-flow-empty");
          value.appendChild(now);
          if (this.model.initial && field.type !== "secret" && this.isChanged(field)) {
            const was = h("span", "cx-flow-was"); setText(was, fill(labels.flowWas, { value: flowDisplay(this, field, this.initialOf(field)) }));
            value.appendChild(was); row.classList.add("cx-flow-changed");
          }
          if (this.errors.has(field.id)) { const error = h("span", "cx-flow-error"); setText(error, this.errors.get(field.id)); value.appendChild(error); row.classList.add("cx-flow-invalid"); }
          if (!field.readOnly) {
            const change = h("button", "cx-flow-link cx-flow-change");
            change.type = "button"; setText(change, labels.flowChange); change.setAttribute("aria-label", fill(labels.flowChangeField, { field: field.label }));
            change.addEventListener("click", () => this.change(field).catch(error => this.report(error, "change")));
            action.appendChild(change);
          }
          row.append(term, value, action);
          list.appendChild(row);
          shown++;
        }
        group.appendChild(list);
        lists.appendChild(group);
      }
      if (!shown && changesOnly) { const none = h("p", "cx-flow-none"); setText(none, labels.flowNoChanges); lists.appendChild(none); }
    }
  });
