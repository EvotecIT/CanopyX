  // ---------- flow: validation of fields, steps and the whole flow (docs/flow.md#validation) ----------
  // A field: its type, required, its rules (the forms part's checks, the same as grid editing), list and choice counts,
  // item rules, then the host's validators[field](value, values). A step: its visible fields, then validateStep. The flow:
  // every visible step, then validateFlow, whose warnings show on the review page and whose errors block submitting.
  const FLOW_ITEM_RULES = {
    email: value => /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(value),
    host: value => value.length <= 253 && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$/.test(value),
    ip: value => flowIPv4(value) || flowIPv6(value),
    cidr: value => { const [address, prefix, extra] = value.split("/"); return extra === undefined && /^\d{1,3}$/.test(prefix || "") && (flowIPv4(address) && Number(prefix) <= 32 || flowIPv6(address) && Number(prefix) <= 128); },
    url: value => { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch (error) { return false; } }
  };
  function flowIPv4(value) { return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value); }
  function flowIPv6(value) { if (!/^[0-9A-Fa-f:.]{2,45}$/.test(value) || !value.includes(":")) return false; try { return new URL("http://[" + value + "]/").hostname.length > 2; } catch (error) { return false; } }

  Object.assign(FlowView.prototype, {
    /** The first problem a field's own checks find now, without host validators: a message or null. */
    problemNow(field) {
      const fv = this.fields.get(field.id), labels = this.labels, title = field.label;
      if (fv?.pending) return fv.pending;
      if (field.type === "secret") {
        const value = this.secrets.get(field.id) ?? null;
        if (value === null) return field.required && !this.keeps(field) ? fill(labels.gridEditRequired, { column: title }) : null;
        return formCheck(field.spec, value, "text", title, labels, String);
      }
      const value = this.values.get(field.id) ?? null;
      if (field.type === "toggle") return field.required && value !== true ? fill(labels.gridEditRequired, { column: title }) : null;
      if (field.kind === "list") {
        const items = value || [], rules = field.items;
        if (!items.length) return field.required ? field.spec.rules.message || fill(labels.gridEditRequired, { column: title }) : null;
        if (rules.min !== undefined && items.length < rules.min) return fill(labels.flowItemsMin, { field: title, min: rules.min });
        if (rules.max !== undefined && items.length > rules.max) return fill(labels.flowItemsMax, { field: title, max: rules.max });
        const name = rules.rule && "flowItem" + rules.rule[0].toUpperCase() + rules.rule.slice(1);
        for (const item of items) {
          if (rules.rule && !FLOW_ITEM_RULES[rules.rule](item)) return field.spec.rules.message || fill(labels[name], { item });
          if (rules.pattern && !rules.pattern.test(item)) return field.spec.rules.message || fill(labels.flowItemPattern, { item });
        }
        return null;
      }
      if (field.kind === "duration") return formCheck(field.spec, value === null ? null : flowSeconds(value), "number", title, labels, seconds => flowWords(this, seconds));
      const shown = bound => field.type === "datetime" ? flowDisplay(this, field, bound) : typeof bound === "number" ? numberFormat(this.lang, 0, 20).format(bound) : String(bound);
      return formCheck(field.spec, value, field.kind === "number" || field.kind === "datetime" ? field.kind : "text", title, labels, shown);
    },

    /** A field's problem with the host's validator: a message or null. Secrets never reach host validators. */
    async problem(field) {
      const own = this.problemNow(field);
      if (own || field.type === "secret") return own;
      const validator = this.hooks.validators && Object.hasOwn(this.hooks.validators, field.id) ? this.hooks.validators[field.id] : null;
      if (typeof validator !== "function") return null;
      const answer = await this.hook("validators." + field.id, () => validator(flowCopy(this.values.get(field.id) ?? null), this.getValues()));
      return answer.failed || (typeof answer.value === "string" && /\S/.test(answer.value) ? answer.value : null);
    },

    /** Checks one field and shows its message; resolves with the message. */
    async checkField(field) {
      const revision = this.answerRevision, generation = this.generation;
      const ticket = (this.checks ||= new Map()).set(field.id, {}).get(field.id), message = await this.problem(field);
      if (this.checks.get(field.id) !== ticket || this.destroyed || revision !== this.answerRevision || generation !== this.generation) return message;
      this.setError(field, message || this.hostErrors.get(field.id) || null);
      this.renderRail();
      return message;
    },

    setError(field, message) {
      if (message) this.errors.set(field.id, message); else this.errors.delete(field.id);
      const fv = this.fields.get(field.id);
      fv?.message(message);
      if (field.type === "list" && fv?.instance.flag) fv.instance.flag(item => !!message && !!item && this.itemFails(field, item));
    },
    itemFails(field, item) {
      const rules = field.items;
      return !!rules.rule && !FLOW_ITEM_RULES[rules.rule](item) || !!rules.pattern && !rules.pattern.test(item);
    },

    /** The answers of a step's visible fields (secrets as set or not), to tell whether they changed while checks ran. */
    answerKey(step) {
      return JSON.stringify([this.answerRevision, this.stepFields(step).map(field => field.type === "secret" ? this.secrets.has(field.id) : [this.values.get(field.id) ?? null, this.fields.get(field.id)?.pending || null])]);
    },

    stepErrorCount(step) {
      return this.stepFields(step).filter(field => this.errors.has(field.id)).length + (this.stepErrors.has(step.id) || this.hostStepErrors.has(step.id) ? 1 : 0);
    },

    /** Reads a validateStep or validateFlow answer: a message, or { errors, warnings, fieldErrors }. */
    bucket(answer) {
      const result = { errors: [], warnings: [], fields: Object.create(null) }, text = value => typeof value === "string" && /\S/.test(value);
      if (answer.failed) { result.errors.push(answer.failed); return result; }
      const value = answer.value;
      if (text(value)) result.errors.push(value);
      else if (flowIs(value)) {
        for (const [name, key] of [["errors", "errors"], ["warnings", "warnings"]]) if (Array.isArray(value[name])) result[key].push(...value[name].filter(text));
        if (flowIs(value.fieldErrors)) for (const [id, message] of Object.entries(value.fieldErrors)) if (this.model.fields.has(id) && text(message)) result.fields[id] = message;
      }
      return result;
    },

    /** Validates a step's visible fields and the host's step rule; with show, messages appear in place. */
    async validateStep(step, show) {
      // Answers that change while asynchronous checks run are checked again, so a late result never lands on a newer answer.
      const generation = this.generation;
      let fields, messages, result, moved = false, stable = false;
      for (let round = 0; round < 4; round++, moved = true) {
        const before = this.answerKey(step);
        fields = this.stepFields(step); messages = await Promise.all(fields.map(field => this.problem(field)));
        if (this.destroyed || this.generation !== generation) return { valid: false, errors: [], warnings: [], moved: true };
        result = { errors: [], warnings: [], fields: Object.create(null) };
        if (!messages.some(Boolean) && typeof this.hooks.validateStep === "function")
          result = this.bucket(await this.hook("validateStep", () => this.hooks.validateStep(step.id, this.getValues())));
        if (this.destroyed || this.generation !== generation) return { valid: false, errors: [], warnings: [], moved: true };
        if (this.answerKey(step) === before) { stable = true; break; }
      }
      if (this.destroyed) return { valid: false, errors: [], warnings: [] };
      // A host's message from its last answer shows until the field changes, but never blocks submitting again.
      const failing = [];
      fields.forEach((field, index) => {
        const local = messages[index] || result.fields[field.id] || null, message = local || this.hostErrors.get(field.id) || null;
        if (show || !message) this.setError(field, message);
        else this.errors.set(field.id, message);
        if (local) failing.push({ field: field.id, step: step.id, message: local });
      });
      if (result.errors.length) this.stepErrors.set(step.id, result.errors.join(" ")); else this.stepErrors.delete(step.id);
      const errors = failing;
      for (const message of result.errors) errors.push({ step: step.id, message });
      return { valid: stable && !errors.length, errors, warnings: result.warnings.map(message => ({ step: step.id, message })), moved };
    },

    /** Validates every visible step, then the host's flow rule. */
    async validateAll() {
      const generation = this.generation;
      for (let round = 0; round < 4; round++) {
        const revision = this.answerRevision, result = await this.validateAllOnce(generation);
        if (this.destroyed || generation !== this.generation) return { valid: false, errors: [], warnings: [] };
        if (revision === this.answerRevision) return result;
      }
      return { valid: false, errors: [{ message: this.labels.flowNotSubmitted }], warnings: [] };
    },

    async validateAllOnce(generation) {
      const results = [], steps = this.visibleSteps().filter(step => step.type === "form");
      for (const step of steps) {
        results.push(await this.validateStep(step, false));
        if (this.destroyed || generation !== this.generation) return { valid: false, errors: [], warnings: [] };
      }
      if (this.destroyed || generation !== this.generation) return { valid: false, errors: [], warnings: [] };
      const errors = results.flatMap(result => result.errors), warnings = results.flatMap(result => result.warnings);
      steps.forEach((step, index) => { if (results[index].valid) this.completed.add(step.id); else this.completed.delete(step.id); });
      if (!errors.length && typeof this.hooks.validateFlow === "function") {
        const result = this.bucket(await this.hook("validateFlow", () => this.hooks.validateFlow(this.getValues())));
        if (this.destroyed || generation !== this.generation) return { valid: false, errors: [], warnings: [] };
        for (const [id, message] of Object.entries(result.fields)) if (this.visible(this.model.fields.get(id))) {
          this.setError(this.model.fields.get(id), message); errors.push({ field: id, step: this.model.fields.get(id).step.id, message });
        }
        errors.push(...result.errors.map(message => ({ message })));
        warnings.push(...result.warnings.map(message => ({ message })));
      }
      return { valid: results.every(result => result.valid) && !errors.length, errors, warnings };
    },

    /** The public validate(stepId?): { valid, errors, warnings } for a step or the whole flow, with messages in place. */
    async validate(stepId) {
      if (stepId === undefined) { const result = await this.validateAll(); this.renderRail(); return result; }
      const step = this.model.steps.find(item => item.id === stepId);
      if (!step) flowFail("there is no step '" + stepId + "'");
      const result = step.type === "form" && this.stepVisible(step) ? await this.validateStep(step, true) : { valid: true, errors: [], warnings: [] };
      this.renderRail();
      return { valid: result.valid, errors: result.errors, warnings: result.warnings };
    },

    setFieldError(id, message) {
      const field = this.model.fields.get(id);
      if (!field || message != null && (typeof message !== "string" || !/\S/.test(message))) flowFail("setFieldError takes a field id and a message or null");
      // A host's message stands like an answer's message: until the reader changes the field.
      if (message) this.hostErrors.set(id, message); else this.hostErrors.delete(id);
      this.setError(field, message ?? null);
      this.renderRail();
      this.refreshReview();
    },

    /** The summary at the top of a step: what is wrong, with links to each field. */
    showSummary(step, focus = true) {
      const section = this.sections.get(step.id), summary = section?._cxSummary;
      if (!summary) return;
      const list = h("ul"), title = h("p", "cx-flow-summary-title");
      setText(title, this.labels.flowErrorSummary);
      for (const field of this.stepFields(step)) if (this.errors.has(field.id)) {
        const item = h("li"), link = h("button", "cx-flow-link");
        link.type = "button"; setText(link, this.errors.get(field.id));
        link.addEventListener("click", () => this.fields.get(field.id)?.focus());
        item.appendChild(link); list.appendChild(item);
      }
      const stepMessage = this.stepErrors.get(step.id) || this.hostStepErrors.get(step.id);
      if (stepMessage) { const item = h("li"); setText(item, stepMessage); list.appendChild(item); }
      summary.replaceChildren(title, list);
      summary.hidden = !list.children.length;
      if (!summary.hidden && focus) summary.focus({ preventScroll: false });
    }
  });
