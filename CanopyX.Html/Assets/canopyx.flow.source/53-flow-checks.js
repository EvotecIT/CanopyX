  // ---------- flow: server checks, named host actions such as "Test sign-in" (docs/flow.md#server-checks) ----------
  // A check runs on its button, or on Next when the step requires it, through hooks.check(checkId, values, { signal, secret }),
  // where secret(id) reads a secret the check names. The host answers { status: pass | warning | fail, message, details,
  // fieldErrors }. Changing any field the check names marks its result stale. required "pass" blocks Next until the check
  // passes; required "run" needs it to have run on the current answers, and a warning to be acknowledged. Exceptions,
  // rejections and timeouts become a failed result with the host's message; Cancel stops a running check.
  const FLOW_CHECK_MARKS = { pass: "✓", warning: "!", fail: "×", running: "…" };

  Object.assign(FlowView.prototype, {
    /** The block of a step's checks, built with the step and painted from the check state. */
    checkBlock(step) {
      const block = h("div", "cx-flow-checks"), title = h("h4", "cx-flow-section-title");
      title.id = this.id + "-c-" + step.id; setText(title, this.labels.flowChecks);
      block.setAttribute("role", "group"); block.setAttribute("aria-labelledby", title.id);
      block.appendChild(title);
      for (const check of step.checks) {
        const item = h("div", "cx-flow-check-item"), head = h("div", "cx-flow-check-head"), run = h("button", "cx-flow-btn"), cancel = h("button", "cx-flow-btn cx-flow-quiet");
        const status = h("span", "cx-flow-check-status"), mark = h("span", "cx-flow-check-mark"), text = h("span"), message = h("p", "cx-flow-check-message"), details = h("dl", "cx-flow-check-details");
        const ack = h("label", "cx-flow-switch cx-flow-check-ack"), box = h("input"), ackText = h("span");
        item.dataset.cxCheck = check.id;
        run.type = cancel.type = "button"; setText(run, check.label); setText(cancel, this.labels.flowCancel); cancel.hidden = true;
        status.setAttribute("role", "status"); mark.setAttribute("aria-hidden", "true"); status.append(mark, text);
        status.id = this.id + "-cs-" + check.id; run.setAttribute("aria-describedby", status.id);
        run.addEventListener("click", () => this.runCheck(check.id).catch(error => this.report(error, "check")));
        cancel.addEventListener("click", () => this.checkState.get(check.id)?.controller?.abort());
        box.type = "checkbox"; setText(ackText, this.labels.flowCheckAcknowledge); ack.append(box, ackText); ack.hidden = true;
        box.addEventListener("change", () => { const state = this.checkState.get(check.id); if (state) state.acknowledged = box.checked; this.paintCheck(check); this.renderRail(); });
        head.append(run, status, cancel);
        item.appendChild(head);
        if (check.description) { const description = h("p", "cx-flow-help"); setText(description, check.description); item.appendChild(description); }
        item.append(message, details, ack);
        item._cx = { run, cancel, mark, text, message, details, ack, box };
        block.appendChild(item);
      }
      return block;
    },

    paintCheck(check) {
      const section = this.sections.get(check.step.id), item = section?.querySelector('[data-cx-check="' + check.id + '"]');
      if (!item) return;
      const parts = item._cx, state = this.checkState.get(check.id), labels = this.labels, result = state?.result;
      const phase = state?.running ? "running" : !result ? "none" : state.stale ? "stale" : result.status;
      item.dataset.cxState = phase;
      setText(parts.mark, FLOW_CHECK_MARKS[phase] || "");
      setText(parts.text, phase === "running" ? labels.flowCheckRunning : phase === "none" ? labels.flowCheckNotRun : phase === "stale" ? labels.flowCheckStale :
        fill(phase === "pass" ? labels.flowCheckPassed : phase === "warning" ? labels.flowCheckWarning : labels.flowCheckFailed, { time: this.checkTime(state.at) }));
      parts.run.disabled = !!state?.running; parts.cancel.hidden = !state?.running;
      parts.message.hidden = !result?.message || phase === "running"; setText(parts.message, result?.message || "");
      parts.details.replaceChildren(...(phase === "running" ? [] : result?.details || []).map(row => { const line = h("div"), term = h("dt"), value = h("dd"); setText(term, row.label); setText(value, row.value); line.append(term, value); return line; }));
      parts.details.hidden = !parts.details.children.length;
      parts.ack.hidden = !(check.required === "run" && phase === "warning");
      parts.box.checked = !!state?.acknowledged;
    },
    checkTime(at) {
      try { return new Intl.DateTimeFormat(this.lang || undefined, { timeStyle: "short" }).format(new Date(at)); } catch (error) { return at; }
    },

    /** A field changed: the results of the checks that test it no longer describe the answers. */
    checksChanged(field) {
      for (const check of this.model.checks.values()) {
        if (!check.fields.includes(field.id)) continue;
        const state = this.checkState.get(check.id);
        if (state?.result && !state.stale) { state.stale = true; state.acknowledged = false; this.paintCheck(check); }
      }
    },

    /** Runs a check (api.runCheck): resolves with its result, or null when it was cancelled. */
    async runCheck(id) {
      const check = this.model.checks.get(id);
      if (!check) flowFail("there is no check '" + id + "'");
      const state = this.checkState.get(id) || {}, controller = new AbortController(), ticket = {};
      state.controller?.abort();
      Object.assign(state, { controller, ticket, running: true });
      this.checkState.set(id, state); this.paintCheck(check);
      const secrets = new Map(check.fields.map(name => this.model.fields.get(name)).filter(field => field.type === "secret" && this.visible(field) && this.secrets.has(field.id)).map(field => [field.id, this.secrets.get(field.id)]));
      const run = typeof this.hooks.check === "function" ? signal => this.hooks.check(id, this.getValues(), { signal, secret: name => secrets.get(name) ?? null }) : () => { throw new Error(this.labels.flowNoHostHook); };
      const answer = await this.timed("check", run, controller);
      secrets.clear();
      if (state.ticket !== ticket || this.destroyed) return null;
      state.running = false;
      if (answer.cancelled) { this.paintCheck(check); return null; }
      const result = answer.failed ? { status: "fail", message: answer.failed, details: [], fieldErrors: {} } : this.checkResult(answer.value);
      Object.assign(state, { result, at: new Date().toISOString(), stale: false, acknowledged: false });
      for (const [field, message] of Object.entries(result.fieldErrors)) { this.hostErrors.set(field, message); this.setError(this.model.fields.get(field), message); }
      this.paintCheck(check); this.renderRail(); this.reviewStale = true;
      const detail = flowCopy({ check: id, result: { status: result.status, message: result.message, details: result.details, at: state.at } });
      this.emit("flowCheck", detail, "onCheck");
      return detail.result;
    },

    /** Reads a check answer; anything malformed is a failure with the generic message. */
    checkResult(value) {
      const text = item => typeof item === "string" && /\S/.test(item) ? item.slice(0, 1000) : null;
      if (!flowIs(value) || !["pass", "warning", "fail"].includes(value.status)) return { status: "fail", message: this.labels.flowCheckInvalid, details: [], fieldErrors: {} };
      const result = { status: value.status, message: text(value.message), details: [], fieldErrors: {} };
      if (Array.isArray(value.details)) for (const row of value.details.slice(0, 20)) if (flowIs(row) && text(row.label) && flowScalar(row.value)) result.details.push({ label: text(row.label), value: String(row.value).slice(0, 1000) });
      if (flowIs(value.fieldErrors)) for (const [id, message] of Object.entries(value.fieldErrors)) if (this.model.fields.has(id) && text(message)) result.fieldErrors[id] = text(message);
      return result;
    },

    /** The messages of a step's required checks; with run, the ones that have not run on these answers run first. */
    async checkGate(step, run) {
      const problems = [];
      for (const check of step.checks) {
        if (!check.required || !check.fields.some(id => this.visible(this.model.fields.get(id)))) continue;
        let state = this.checkState.get(check.id);
        if (run && (!state?.result || state.stale) && !state?.running) { await this.runCheck(check.id); state = this.checkState.get(check.id); }
        const result = state?.result, labels = this.labels;
        if (!result || state.stale) problems.push(fill(labels.flowCheckNeeded, { check: check.label }));
        else if (result.status === "fail" || check.required === "pass" && result.status === "warning") problems.push(fill(labels.flowCheckNotPassed, { check: check.label }));
        else if (result.status === "warning" && !state.acknowledged) problems.push(fill(labels.flowCheckConfirmWarning, { check: check.label }));
      }
      return problems;
    },

    /** The checks of visible steps with a current result, for the proposal and the review page. */
    checkSummary() {
      const checks = {};
      for (const check of this.model.checks.values()) {
        const state = this.checkState.get(check.id);
        if (this.stepVisible(check.step) && state?.result && !state.stale) checks[check.id] = { status: state.result.status, at: state.at };
      }
      return checks;
    }
  });
