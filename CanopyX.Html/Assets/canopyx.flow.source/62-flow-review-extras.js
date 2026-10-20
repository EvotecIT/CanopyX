  // ---------- flow: what else the review page shows (docs/flow.md#the-review-page) ----------
  // The preset the answers started from and how many changed; each check with its last result; the host's preview of what
  // submitting will do (hooks.preview, drawn from structured rows, never HTML); the equivalent command; and, above the submit
  // button, a typed confirmation for destructive flows and an acknowledgement that shows only while its condition holds.
  const FLOW_PREVIEW_TONES = ["info", "success", "warning", "danger"];

  Object.assign(FlowView.prototype, {
    reviewExtras(section) {
      const labels = this.labels;
      if (this.preset) { const line = h("p", "cx-flow-preset-line"); setText(line, fill(plural(labels.flowPresetChanges, this.presetChanges(), this.lang), { preset: this.preset.label, count: this.presetChanges() })); section.appendChild(line); }
      const checks = [...this.model.checks.values()].filter(check => this.stepVisible(check.step));
      if (checks.length) {
        const group = h("section", "cx-flow-review-group cx-flow-review-checks"), heading = h("h4", "cx-flow-review-title"), list = h("dl", "cx-flow-answers");
        heading.id = this.id + "-rc"; setText(heading, labels.flowChecks); group.setAttribute("aria-labelledby", heading.id);
        for (const check of checks) {
          const state = this.checkState.get(check.id), result = state?.result, row = h("div", "cx-flow-answer"), term = h("dt"), value = h("dd", "cx-flow-answer-value"), action = h("dd", "cx-flow-answer-action");
          setText(term, check.label);
          const phase = !result ? "none" : state.stale ? "stale" : result.status;
          setText(value, phase === "none" ? labels.flowCheckNotRun : phase === "stale" ? labels.flowCheckStale :
            fill(phase === "pass" ? labels.flowCheckPassed : phase === "warning" ? labels.flowCheckWarning : labels.flowCheckFailed, { time: this.checkTime(state.at) }) + (result.message ? " · " + result.message : ""));
          row.dataset.cxState = phase;
          const change = h("button", "cx-flow-link cx-flow-change");
          change.type = "button"; setText(change, labels.flowChange); change.setAttribute("aria-label", fill(labels.flowChangeField, { field: check.label }));
          change.addEventListener("click", () => { this.returnToReview = true; this.go(check.step, "back").catch(error => this.report(error, "goTo")); });
          action.appendChild(change);
          row.append(term, value, action); list.appendChild(row);
        }
        group.append(heading, list); section.appendChild(group);
      }
      if (typeof this.hooks.preview === "function") section.appendChild(this.previewBlock());
      const command = this.commandPanel();
      if (command) section.appendChild(command);
    },

    /** The host's preview: loading, then its rows, or why it failed. A later review drops an earlier answer. */
    previewBlock() {
      const labels = this.labels, block = h("section", "cx-flow-preview"), heading = h("h4", "cx-flow-review-title"), body = h("div", "cx-flow-preview-body");
      heading.id = this.id + "-rp"; setText(heading, labels.flowPreview); block.setAttribute("aria-labelledby", heading.id); block.setAttribute("aria-busy", "true");
      const loading = h("p", "cx-flow-loading"); setText(loading, labels.flowPreviewLoading); body.appendChild(loading);
      block.append(heading, body);
      this.previewController?.abort();
      const controller = this.previewController = new AbortController();
      this.timed("preview", signal => this.hooks.preview(this.getValues(), { signal }), controller).then(answer => {
        if (this.previewController !== controller || this.destroyed || answer.cancelled) return;
        block.removeAttribute("aria-busy");
        if (answer.failed) { const failed = h("p", "cx-flow-error"); setText(failed, fill(labels.flowPreviewFailed, { message: answer.failed })); body.replaceChildren(failed); return; }
        body.replaceChildren(...this.previewContent(answer.value));
      });
      return block;
    },

    /** Structured preview content: rows of { label, value, tone }, or { title, rows, notes }. Text only. */
    previewContent(value) {
      const text = item => typeof item === "string" && /\S/.test(item) ? item.slice(0, 1000) : null, nodes = [];
      const content = Array.isArray(value) ? { rows: value } : flowIs(value) ? value : null;
      if (!content) { const none = h("p", "cx-flow-none"); setText(none, this.labels.flowPreviewNone); return [none]; }
      if (text(content.title)) { const title = h("p", "cx-flow-preview-title"); setText(title, text(content.title)); nodes.push(title); }
      const rows = (Array.isArray(content.rows) ? content.rows : []).slice(0, 50).filter(row => flowIs(row) && text(row.label) && flowScalar(row.value));
      if (rows.length) {
        const list = h("dl", "cx-flow-answers cx-flow-preview-rows");
        for (const row of rows) {
          const item = h("div", "cx-flow-answer"), term = h("dt"), data = h("dd", "cx-flow-answer-value");
          setText(term, text(row.label)); setText(data, String(row.value).slice(0, 1000));
          if (FLOW_PREVIEW_TONES.includes(row.tone)) data.classList.add("cx-flow-tone-" + row.tone);
          item.append(term, data); list.appendChild(item);
        }
        nodes.push(list);
      }
      for (const note of (Array.isArray(content.notes) ? content.notes : []).slice(0, 10).map(text).filter(Boolean)) { const line = h("p", "cx-flow-preview-note"); setText(line, note); nodes.push(line); }
      if (!nodes.length) { const none = h("p", "cx-flow-none"); setText(none, this.labels.flowPreviewNone); nodes.push(none); }
      return nodes;
    },

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
