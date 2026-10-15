  // ---------- editing: validation of cells and rows ----------
  // A cell is checked when its value changes: its type, the column's rules, then editing.validators[column](value, row),
  // which returns a message, null, or a promise of one. A row is checked before it commits: every changed cell, then
  // editing.validateRow(row, change), which returns a row message, messages by column, null, or a promise of them.
  // Messages follow the labels (gridEditRequired, gridEditMin, ...) unless the column's validation gives its own message.
  const editErrors = entry => Object.assign(Object.create(null), entry.rowErrors, entry.errors);
  const editInvalid = entry => !!(entry.error || entry.rowError || Object.keys(editErrors(entry)).length);
  const editMessage = value => typeof value === "string" && value.trim() ? value : null;

  Object.assign(DataGrid.prototype, {
    // Returns the first message, null, or the promise of an asynchronous host validator.
    editRules(spec, value, record) {
      const rules = spec.rules, column = spec.column, labels = this.edit.labels;
      const say = (name, values) => rules.message || fill(labels[name], { column: column.title, ...values });
      const shown = bound => column.kind === "datetime" ? cellText(bound, column, this.fmt) : typeof bound === "number" ? numberFormat(this.lang).format(bound) : String(bound);
      if (value == null || value === "") { if (rules.required) return say("gridEditRequired"); }
      else {
        if (column.kind === "number" && !(typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return say("gridEditNumber");
        if (column.kind === "datetime" && !(typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)))) return say("gridEditDate");
        if (typeof value === "number" || column.kind === "datetime") {
          const at = column.kind === "datetime" ? Date.parse(value) : value, of = bound => typeof bound === "string" ? Date.parse(bound) : bound;
          if (rules.min !== undefined && at < of(rules.min)) return say("gridEditMin", { min: shown(rules.min) });
          if (rules.max !== undefined && at > of(rules.max)) return say("gridEditMax", { max: shown(rules.max) });
          const base = typeof rules.min === "number" ? rules.min : 0, steps = rules.step && (value - base) / rules.step;
          if (typeof value === "number" && rules.step && Math.abs(steps - Math.round(steps)) > 1e-9) return say("gridEditStep", { step: shown(rules.step) });
        }
        if (typeof value === "string" && column.kind !== "datetime") {
          if (rules.minLength !== undefined && value.length < rules.minLength) return say("gridEditMinLength", { min: rules.minLength });
          if (rules.maxLength !== undefined && value.length > rules.maxLength) return say("gridEditMaxLength", { max: rules.maxLength });
          if (spec.pattern && !spec.pattern.test(value)) return say("gridEditPattern");
        }
      }
      const validators = this.edit.options.validators, validator = validators && Object.hasOwn(validators, spec.id) ? validators[spec.id] : null;
      if (typeof validator !== "function") return null;
      let result;
      try { result = validator(value, editCopy(record)); } catch (error) { return error.message || String(error); }
      if (!result || typeof result.then !== "function") return editMessage(result);
      return Promise.resolve(result).then(editMessage, error => error?.message || String(error));
    },

    // Checks a changed cell and records its message; resolves with the message once an asynchronous validator answers.
    editCheck(id, spec, checked) {
      const state = this.edit, entry = state.changes.get(id);
      if (!entry || !Object.hasOwn(entry.values, spec.id)) return Promise.resolve(null);
      const value = entry.values[spec.id], key = id + "\u0000" + spec.id;
      const token = { value, row: checked?.row ?? JSON.stringify(entry.row.cells) };
      state.checks.set(key, token);
      (entry.checked ||= new Map()).set(spec.id, token);
      const settle = message => {
        if (state.checks.get(key) !== token) return message;
        state.checks.delete(key);
        const current = state.changes.get(id);
        if (current && editSame(current.values[spec.id], value)) {
          if (message) current.errors[spec.id] = message; else delete current.errors[spec.id];
          this.editChanged(); this.editRefreshMessage();
        }
        return message;
      };
      const result = checked ? checked.result : this.editRules(spec, value, entry.row);
      if (result && typeof result.then === "function") return token.promise = result.then(settle);
      return token.promise = Promise.resolve(settle(result || null));
    },

    // Every changed cell of a row, then the row validator, until the values stop changing under the checks (an edit made
    // while they run is checked too). Resolves with { id, valid, errors, error }.
    async editValidateRow(id, refresh = false) {
      const state = this.edit, same = (left, right) => Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(column => editSame(left[column], right[column]));
      let entry;
      for (let round = 0; round < 5; round++) {
        entry = state.changes.get(id);
        if (!entry) return { id, valid: true, errors: {} };
        const values = { ...entry.values }, shape = JSON.stringify(entry.row.cells), used = new Map();
        await Promise.all(Object.keys(values).map(column => {
          const pending = state.checks.get(id + "\u0000" + column), checked = entry.checked?.get(column);
          const matches = token => token && token.row === shape && editSame(token.value, values[column]);
          const kept = !refresh && matches(checked) ? checked : matches(pending) ? pending : null;
          const result = kept?.promise ?? this.editCheck(id, state.specs.get(column));
          used.set(column, entry.checked?.get(column));
          return result;
        }));
        for (const [column, token] of used) if (entry.checked?.get(column) === token) entry.checked.delete(column);
        const validator = state.options.validateRow;
        if (validator && state.changes.get(id) === entry && same(values, entry.values)) {
          let result;
          try { result = await validator(editCopy(entry.row), this.editChangeOf(entry)); } catch (error) { result = error.message || String(error); }
          if (state.changes.get(id) === entry && same(values, entry.values)) {
            entry.rowError = editMessage(result); entry.rowErrors = Object.create(null);
            if (result && typeof result === "object") for (const [column, message] of Object.entries(result))
              if (editMessage(message) && this.columns.some(item => item.id === column)) entry.rowErrors[column] = message;
            this.editChanged(); this.editRefreshMessage();
          }
        }
        if (state.changes.get(id) === entry && same(values, entry.values) && Object.keys(values).every(column => !state.checks.has(id + "\u0000" + column))) break;
      }
      const current = state.changes.get(id) || entry;
      return { id, valid: !editInvalid({ ...current, error: null }), errors: editErrors(current), error: current.rowError || null };
    },
    async validate(ids) {
      if (ids !== undefined && !Array.isArray(ids)) throw new Error("CanopyX: validate takes an array of row IDs.");
      const rows = await Promise.all((ids ?? [...this.edit.changes.keys()]).map(id => this.editValidateRow(id, true)));
      return editCopy({ valid: rows.every(row => row.valid), rows });
    },

    // A change as the protocol carries it: the new values and the values the row started from.
    editChangeOf(entry) {
      const change = { id: entry.id, values: { ...entry.values }, original: Object.create(null) };
      for (const column of Object.keys(entry.values)) change.original[column] = cellValue(entry.original[column]);
      return editCopy(change);
    }
  });
