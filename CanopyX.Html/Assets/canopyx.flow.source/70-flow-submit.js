  // ---------- flow: the proposal and the host's answer (docs/flow.md#the-proposal-and-the-hosts-answer) ----------
  // CanopyX never writes. Submit validates everything and raises canopyx:flowSubmit with one flowSubmission: the visible
  // answers, the state of each secret, the changes and a JSON patch. The host answers saved, accepted, error or conflict
  // through respondWith, the onSubmit callback's result or hooks.submit. Secret values leave only through detail.secret(id),
  // once each, until the answer settles.
  const flowPointer = path => "/" + path.split(".").map(part => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

  Object.assign(FlowView.prototype, {
    /** The flowSubmission document for the current answers. */
    submission() {
      const model = this.model, edit = !!model.initial, values = {}, secrets = {}, changes = [], patch = [];
      for (const field of model.fields.values()) {
        if (!this.visible(field)) continue;
        if (field.type === "secret") {
          if (this.secrets.has(field.id)) secrets[field.id] = { state: "set" };
          else if (this.keeps(field)) secrets[field.id] = { state: "keep" };
          continue;
        }
        const value = flowCopy(this.values.get(field.id) ?? null), from = flowNormal(this.initialOf(field)), to = flowNormal(value);
        values[field.id] = value;
        if (edit && this.isChanged(field)) changes.push(Object.assign({ field: field.id }, field.path ? { path: field.path } : {}, { from: flowCopy(from), to: flowCopy(to) }));
        if (!field.path) continue;
        if (edit) {
          if (!this.isChanged(field)) continue;
          patch.push(to === null ? { op: "remove", path: flowPointer(field.path) } : { op: from === null ? "add" : "replace", path: flowPointer(field.path), value: flowCopy(to) });
        } else if (to !== null) patch.push({ op: "add", path: flowPointer(field.path), value: flowCopy(to) });
      }
      const proposal = { kind: "flowSubmission", flow: model.id, version: 1, mode: edit ? "edit" : "create" };
      if (model.baseline !== null) proposal.baseline = model.baseline;
      return Object.assign(proposal, { values, secrets, changes, patch });
    },

    /** Validates everything, raises flowSubmit and waits for the host's answer; resolves with the answer, or null. */
    async submit() {
      if (this.busy || this.phase !== "form") return null;
      const generation = this.generation, revision = this.answerRevision, ticket = this.submissionTicket = {};
      const current = () => !this.destroyed && generation === this.generation && this.submissionTicket === ticket;
      const sameAnswers = () => current() && revision === this.answerRevision;
      this.busy = true; this.banner = null; this.hostErrors.clear(); this.hostStepErrors.clear(); this.renderActions();
      try {
        const result = await this.validateAll();
        if (!sameAnswers()) return null;
        if (!result.valid) {
          const review = this.reviewStep();
          if (review && this.stepVisible(review)) { if (this.step !== review) await this.go(review, "forward"); else { this.reviewStale = true; this.render(); } }
          else { const first = result.errors.find(error => error.step); await this.go(this.model.steps.find(step => step.id === first?.step) || this.step, "back"); if (first?.step) this.showSummary(this.step); }
          return null;
        }
        // Only the secrets of visible fields travel: one typed into a field that is hidden now is left behind, as its answer is.
        const proposal = this.submission(), secrets = new Map([...this.secrets].filter(([id]) => this.visible(this.model.fields.get(id)))), read = new Set();
        let answer, answered = false, open = true;
        const close = this.closeSubmission = () => { open = false; secrets.clear(); };
        const detail = Object.assign(flowCopy(proposal), {
          respondWith: value => {
            if (!answered && open) {
              answered = true; answer = Promise.resolve(value);
              // Observe rejection even if cancellation, reset or changed answers retire this proposal before it is awaited.
              answer.catch(() => {});
            }
          },
          secret: id => { if (!open || read.has(id) || !secrets.has(id)) return null; read.add(id); return secrets.get(id); }
        });
        Object.freeze(detail);
        const go = this.emit("flowSubmit", detail, null, true);
        if (!go || !sameAnswers()) { close(); return null; }
        if (!answered && typeof this.options.onSubmit === "function") { const value = await this.hook("onSubmit", () => this.options.onSubmit(detail)); if (value.failed) { answered = true; answer = { status: "error", message: value.failed }; } else if (value.value !== undefined) { answered = true; answer = value.value; } }
        if (!sameAnswers()) { close(); return null; }
        if (!answered && typeof this.hooks.submit === "function") { const value = await this.hook("submit", () => this.hooks.submit(detail)); answered = true; answer = value.failed ? { status: "error", message: value.failed } : value.value; }
        if (!sameAnswers()) { close(); return null; }
        let settled;
        if (!answered || answer === undefined) settled = { status: "error", message: this.labels.flowNoHost };
        else { const value = await this.hook("respondWith", () => answer); settled = value.failed ? { status: "error", message: value.failed } : this.answerOf(value.value); }
        close();
        if (!sameAnswers()) return null;
        this.busy = false;
        // Retire this operation before callbacks can start correction/navigation work of their own.
        this.submissionTicket = null; this.closeSubmission = null;
        this.settle(settled);
        return settled;
      } finally { if (current()) { this.busy = false; this.closeSubmission?.(); this.closeSubmission = null; if (this.phase === "form") this.renderActions(); } }
    },

    /** Checks a host answer; anything malformed reads as an error with the generic message. */
    answerOf(value) {
      const text = item => typeof item === "string" && /\S/.test(item) ? item : null;
      if (!flowIs(value) || !["saved", "accepted", "error", "conflict"].includes(value.status)) return { status: "error", message: this.labels.flowNotSubmitted };
      const answer = { status: value.status, message: text(value.message), fieldErrors: {}, stepErrors: {}, result: [], links: [] };
      if (flowIs(value.fieldErrors)) for (const [id, message] of Object.entries(value.fieldErrors)) if (this.model.fields.has(id) && text(message)) answer.fieldErrors[id] = message;
      if (flowIs(value.stepErrors)) for (const [id, message] of Object.entries(value.stepErrors)) if (this.model.steps.some(step => step.id === id) && text(message)) answer.stepErrors[id] = message;
      if (Array.isArray(value.result)) for (const row of value.result.slice(0, 50)) if (flowIs(row) && text(row.label) && flowScalar(row.value)) answer.result.push({ label: row.label, value: String(row.value), once: row.once === true });
      if (Array.isArray(value.links)) for (const link of value.links.slice(0, 10)) if (flowIs(link) && text(link.label) && typeof link.href === "string" && flowSafeHref(link.href)) answer.links.push({ label: link.label, href: link.href });
      return answer;
    },

    /** Shows what the host answered: the result panel, the progress panel, or the review page with its messages. */
    settle(answer) {
      // Answers the flow builds itself (no host, a failed hook) carry only a status and a message.
      answer = Object.assign({ message: null, fieldErrors: {}, stepErrors: {}, result: [], links: [] }, answer);
      if (answer.status === "saved" || answer.status === "accepted") {
        this.phase = answer.status === "saved" ? "result" : "progress";
        this.panel = answer.status === "saved" ? this.resultPanel(answer) : this.progressPanel(answer);
        this.render(); this.panel.querySelector("h3")?.focus();
        this.emit("flowSubmitted", flowCopy(answer), "onSubmitted");
        return;
      }
      this.phase = "form";
      for (const [id, message] of Object.entries(answer.fieldErrors)) { this.hostErrors.set(id, message); this.setError(this.model.fields.get(id), message); }
      for (const [id, message] of Object.entries(answer.stepErrors)) this.hostStepErrors.set(id, message);
      this.reviewStale = true;
      this.banner = answer;
      const review = this.reviewStep();
      const target = review && this.stepVisible(review) ? review : this.visibleSteps().find(step => this.hostStepErrors.has(step.id) || this.stepFields(step).some(field => this.hostErrors.has(field.id))) || this.step;
      // Without a review page the step's summary lists the host's field and step messages too.
      if (target === this.step) { this.render(); if (!review) this.showSummary(this.step); this.stage.querySelector(".cx-flow-answer-banner")?.focus(); }
      else this.go(target, "forward").then(() => { if (!review) this.showSummary(target); else this.stage.querySelector(".cx-flow-answer-banner")?.focus(); });
      this.emit("flowSubmitted", flowCopy(answer), "onSubmitted");
    },

    /** The host's error or conflict on the review page; a conflict offers to reload the current settings. */
    answerBanner() {
      const answer = this.banner, labels = this.labels, banner = h("div", "cx-flow-answer-banner cx-flow-problems"), text = h("p", "cx-flow-banner-title");
      banner.setAttribute("role", "alert"); banner.tabIndex = -1;
      setText(text, answer.message || (answer.status === "conflict" ? labels.flowConflict : labels.flowNotSubmitted));
      banner.appendChild(text);
      if (answer.status === "conflict") {
        const reload = h("button", "cx-flow-btn");
        reload.type = "button"; setText(reload, labels.flowReload);
        reload.addEventListener("click", () => this.emit("flowReload", { baseline: this.model.baseline }, "onReload"));
        banner.appendChild(reload);
      }
      return banner;
    },

    /** Drives an accepted answer: { done, total, message }. */
    setProgress(progress) {
      if (this.phase !== "progress" || !flowIs(progress)) return false;
      const bar = this.panel.querySelector(".cx-flow-bar"), note = this.panel.querySelector(".cx-flow-panel-text");
      if (Number.isFinite(progress.total) && progress.total > 0 && Number.isFinite(progress.done)) {
        const done = Math.max(0, Math.min(progress.total, progress.done));
        bar.max = progress.total; bar.value = done;
        bar.setAttribute("aria-valuetext", fill(this.labels.flowProgress, { done: numberFormat(this.lang, 0, 0).format(done), total: numberFormat(this.lang, 0, 0).format(progress.total) }));
      }
      if (typeof progress.message === "string") setText(note, progress.message);
      return true;
    },
    /** Finishes an accepted answer with the host's final answer. */
    complete(value) {
      if (this.phase !== "progress") return false;
      this.settle(this.answerOf(value));
      return true;
    }
  });

  // Links in an answer: web and mail addresses, and addresses on the page's own origin. The URL parser decides, as the browser
  // will: control characters, spaces and backslashes are refused outright, since parsers strip or reinterpret them.
  function flowSafeHref(href) {
    if (href.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(href)) return false;
    // A network-path address (//host) leaves the page's origin; on a file: page every origin reads as "null", so refuse it outright.
    if (href.startsWith("//")) return false;
    let url;
    try { url = new URL(href, document.baseURI); } catch (error) { return false; }
    if (url.protocol === "mailto:") return /^mailto:/i.test(href);
    // A relative address stays on the page's own scheme and origin (a page opened from disk keeps file: links).
    if (!/^[a-z][a-z\d+.-]*:/i.test(href)) { const page = new URL(document.baseURI); return url.protocol === page.protocol && url.origin === page.origin; }
    return url.protocol === "http:" || url.protocol === "https:";
  }
