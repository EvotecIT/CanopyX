  // ---------- the flow-consent part: the review page's typed confirmation and acknowledgement (docs/flow.md) ----------
  // A destructive flow asks the reader to type a text (or the answer of a field, such as the domain being removed) and to
  // tick an acknowledgement while its condition holds, before its submit button works. Both are the reader's consent in the
  // browser; they do not travel in the proposal.
  const FLOW_PART_LABELS = {
    flowConfirmMismatch: "Type {text} exactly to continue.",
    flowAcknowledgeNeeded: "Confirm this before you submit."
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const { begin: flowBegin, submit: flowSubmit } = FlowView.prototype;
  FLOW_HOST.consent = {
    /** The typed confirmation and the acknowledgement sit right above the submit button. */
    confirm: (view, section, step) => view.reviewConsent(section, step),
    read(raw, step) {
      if (raw.confirm !== undefined) {
        flowKeys(raw.confirm, ["label", "text", "field"], "The confirmation");
        if ((raw.confirm.text === undefined) === (raw.confirm.field === undefined)) flowFail("a confirmation names the text to type or the field that holds it");
        step.confirm = { label: flowString(raw.confirm.label, 200, "The confirmation label", true), text: flowString(raw.confirm.text, 200, "The confirmation text"), field: raw.confirm.field };
      }
      if (raw.acknowledge !== undefined) {
        flowKeys(raw.acknowledge, ["label", "when"], "The acknowledgement");
        step.acknowledge = { label: flowString(raw.acknowledge.label, 400, "The acknowledgement label", true), raw: raw.acknowledge.when };
      }
    },
    /** The acknowledgement's condition reads fields of the flow; the confirmation's field is a text or choice field. */
    finish(model) {
      const review = model.steps.at(-1);
      if (review.type !== "review") return;
      if (review.acknowledge?.raw !== undefined) review.acknowledge.when = flowCondition(review.acknowledge.raw, model, { groups: 0, filters: 0 });
      if (review.confirm?.field !== undefined) {
        const field = model.fields.get(review.confirm.field);
        if (!field) flowFail("the confirmation names the unknown field '" + review.confirm.field + "'");
        if (!["text", "select", "choice", "lookup"].includes(field.type)) flowFail("the confirmation reads a text or choice field");
      }
    }
  };

  Object.assign(FlowView.prototype, {
    /** A fresh start (and reset) clears the typed confirmation and the acknowledgement. */
    begin(values) { flowBegin.call(this, values); this.confirmText = ""; this.acknowledged = false; },
    /** The typed confirmation and the acknowledgement come first: they take focus and say what is missing. */
    async submit() { return !this.busy && this.phase === "form" && this.consentProblem() ? null : flowSubmit.call(this); },
    /** The typed confirmation and the acknowledgement; both are kept while the reader goes back and forth. */
    reviewConsent(section, step) {
      const labels = this.labels;
      if (step.confirm) {
        const box = h("div", "cx-flow-confirm"), label = h("label", "cx-flow-label"), input = h("input", "cx-flow-input"), message = h("p", "cx-flow-error"), target = this.confirmTarget(step);
        input.id = this.id + "-confirm"; label.htmlFor = input.id; setText(label, fill(step.confirm.label, { text: target }));
        input.type = "text"; input.autocomplete = "off"; input.spellcheck = false; input.value = this.confirmText;
        message.id = input.id + "-error"; message.hidden = true;
        input.addEventListener("input", () => { this.confirmText = input.value; if (!message.hidden && this.confirmed(step)) { message.hidden = true; input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); } });
        box.append(label, input, message);
        section.appendChild(box);
      }
      if (step.acknowledge && flowTest(step.acknowledge.when, id => this.read(id))) {
        const label = h("label", "cx-flow-switch cx-flow-acknowledge"), box = h("input"), text = h("span"), message = h("p", "cx-flow-error");
        box.type = "checkbox"; box.checked = this.acknowledged; box.id = this.id + "-ack"; setText(text, step.acknowledge.label);
        message.id = box.id + "-error"; message.hidden = true;
        box.addEventListener("change", () => { this.acknowledged = box.checked; if (box.checked) { message.hidden = true; box.removeAttribute("aria-invalid"); } });
        label.append(box, text);
        section.append(label, message);
      }
    },
    confirmTarget(step) { return step.confirm.text ?? String(this.read(step.confirm.field) ?? ""); },
    confirmed(step) { const target = this.confirmTarget(step); return !!target && this.confirmText.trim() === target; },

    /** Before submitting: the confirmation is typed and the acknowledgement given; otherwise they say so and take focus. */
    consentProblem() {
      const step = this.reviewStep();
      if (!step || !this.stepVisible(step)) return false;
      const labels = this.labels, missing = step.confirm && !this.confirmed(step) || step.acknowledge && flowTest(step.acknowledge.when, id => this.read(id)) && !this.acknowledged;
      // A submit from another step (the API) opens the review page, where the confirmation is asked.
      if (missing && this.step !== step) { this.go(step, "forward").catch(error => this.report(error, "goTo")); return true; }
      if (step.confirm && !this.confirmed(step)) {
        const input = this.stage.querySelector("#" + CSS.escape(this.id + "-confirm")), message = this.stage.querySelector("#" + CSS.escape(this.id + "-confirm-error"));
        if (message) { setText(message, fill(labels.flowConfirmMismatch, { text: this.confirmTarget(step) })); message.hidden = false; input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", message.id); }
        input?.focus();
        return true;
      }
      if (step.acknowledge && flowTest(step.acknowledge.when, id => this.read(id)) && !this.acknowledged) {
        const box = this.stage.querySelector("#" + CSS.escape(this.id + "-ack")), message = this.stage.querySelector("#" + CSS.escape(this.id + "-ack-error"));
        if (message) { setText(message, labels.flowAcknowledgeNeeded); message.hidden = false; box.setAttribute("aria-invalid", "true"); box.setAttribute("aria-describedby", message.id); }
        box?.focus();
        return true;
      }
      return false;
    }
  });
