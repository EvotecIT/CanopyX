  // ---------- editing: column definitions, the change set and its overlay on loaded rows (docs/editing.md) ----------
  // CanopyX never writes data itself. Edits stay in the grid's change set, shown over the loaded rows, until a row or batch
  // commit hands them to the host (onRowCommit, editing.commit or the source's commit) and the host confirms them.

  // The English texts of the editing labels. A view's or a host's gridEdit… labels replace them; the core accepts the names.
  const EDIT_LABELS = {
    gridEditCell: "Edit {column}", gridEditSave: "Save", gridEditCancel: "Cancel", gridEditDiscard: "Discard",
    gridEditUndo: "Undo", gridEditRedo: "Redo", gridEditEdited: "Edited", gridEditChanges: "Unsaved changes: {count}",
    gridEditErrors: "Errors: {count}", gridEditSaving: "Saving…", gridEditSaved: "Saved rows: {count}", gridEditFailed: "Rows not saved: {count}",
    gridEditRequired: "{column} is required.", gridEditNumber: "{column} must be a number.", gridEditDate: "{column} must be a valid date.",
    gridEditMin: "{column} must be at least {min}.", gridEditMax: "{column} must be at most {max}.", gridEditStep: "{column} must be a multiple of {step}.",
    gridEditMinLength: "{column} needs at least {min} characters.", gridEditMaxLength: "{column} allows at most {max} characters.",
    gridEditPattern: "{column} does not have the expected format.", gridEditChoice: "Choose {column} from the list.",
    gridEditConflict: "Someone else changed this row. Reload it and try again.", gridEditRejected: "Not saved: {error}", gridEditNotSaved: "Not saved.",
    gridEditNoMatches: "No matches", gridEditSearching: "Searching…", gridEditUndone: "Undone: {column}", gridEditRedone: "Redone: {column}",
    gridEditNone: "(none)"
  };
  const editCopy = value => gridFreeze(JSON.parse(JSON.stringify(value === undefined ? null : value)));
  const editSame = (left, right) => left === right || left == null && right == null;
  const editScalar = value => value === null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
  const editBad = (id, problem) => { throw new Error("CanopyX: column " + id + " " + problem + "."); };

  // A select or lookup list: scalars or { value, label }, at most 1,000.
  function editOptions(list, id) {
    if (list === undefined) return null;
    if (!Array.isArray(list) || list.length > 1000) editBad(id, "needs an array of at most 1000 editor options");
    return list.map(item => {
      const option = item !== null && typeof item === "object" ? item : { value: item };
      if (!["string", "number", "boolean"].includes(typeof option.value) || option.label !== undefined && typeof option.label !== "string")
        editBad(id, "has an invalid editor option");
      return Object.freeze({ value: option.value, label: option.label ?? String(option.value) });
    });
  }

  // A column's editor and validation, checked once: the editor type (the kind's own editor by default), its options and
  // limits, and the validation rules the C# authoring mirrors (required, min, max, minLength, maxLength, pattern).
  function editSpec(column, editors, columns) {
    const id = column.id, raw = column.editor === undefined ? {} : typeof column.editor === "string" ? { type: column.editor } : column.editor;
    const rules = column.validation === undefined ? {} : column.validation, object = value => value && typeof value === "object" && !Array.isArray(value);
    if (!object(raw) || !object(rules)) editBad(id, "has an invalid editor or validation");
    const type = raw.type ?? column.kind;
    if (typeof type !== "string" || !Object.hasOwn(editors, type)) editBad(id, "names an editor nobody registered");
    // The built-in editors write values of their kind: numbers, text and booleans, or moments and text.
    const fits = { number: ["number"], text: ["text"], toggle: ["text"], date: ["datetime", "text"], datetime: ["datetime", "text"], time: ["datetime", "text"] }[type];
    if (fits && !fits.includes(column.kind)) editBad(id, "cannot use a " + type + " editor for its kind");
    const bound = value => value === undefined || Number.isFinite(value) || typeof value === "string" && !Number.isNaN(Date.parse(value));
    const count = value => value === undefined || Number.isInteger(value) && value >= 0 && value <= 1000000;
    if (raw.step !== undefined && !(Number.isFinite(raw.step) && raw.step > 0) || ![raw.min, raw.max, rules.min, rules.max].every(bound) ||
        !count(rules.minLength) || !count(rules.maxLength) || rules.required !== undefined && typeof rules.required !== "boolean" ||
        [rules.pattern, rules.message, raw.placeholder].some(text => text !== undefined && typeof text !== "string")) editBad(id, "has invalid editor or validation settings");
    let pattern = null;
    // The pattern must compile on its own too, so a stray parenthesis cannot escape the anchors around it.
    if (rules.pattern !== undefined) try { pattern = boundedPattern(rules.pattern, true, true); } catch (error) { editBad(id, "has an invalid or unsafe pattern"); }
    const lookup = raw.lookup ?? (type === "lookup" ? {} : null);
    if (lookup && (!object(lookup) || lookup.column !== undefined && !columns.some(item => item.id === lookup.column) ||
        lookup.limit !== undefined && !(Number.isInteger(lookup.limit) && lookup.limit >= 1 && lookup.limit <= 50) ||
        lookup.minLength !== undefined && !(Number.isInteger(lookup.minLength) && lookup.minLength >= 0 && lookup.minLength <= 16))) editBad(id, "has invalid lookup settings");
    return Object.freeze({ id, column, type, editor: gridFreeze({ ...raw, type }), options: editOptions(raw.options, id),
      lookup: lookup && Object.freeze({ column: lookup.column ?? id, limit: lookup.limit ?? 20, minLength: lookup.minLength ?? 1 }), pattern,
      rules: Object.freeze({ required: !!rules.required, min: rules.min ?? raw.min, max: rules.max ?? raw.max, step: raw.step,
        minLength: rules.minLength, maxLength: rules.maxLength, message: rules.message }) });
  }

  // The cell that shows a new value. An object cell keeps its tone, badges and title, and drops text that described the old
  // value; a select or lookup label becomes the cell's text.
  function editCell(original, value, text) {
    if (!isCellObject(original) && text === undefined) return value;
    const cell = isCellObject(original) ? { ...original } : {};
    delete cell.text; delete cell.searchText; delete cell.sort; delete cell.secondary;
    cell.value = value;
    if (text !== undefined) cell.text = text;
    return cell;
  }

  Object.assign(DataGrid.prototype, {
    // Once per grid, when the part is in: the definitions, the change set, the edit bar and the listeners.
    startEditing() {
      if (this.edit || this.destroyed) return;
      const options = this.opts.editing ?? {}, view = this.view.editing ?? {}, object = value => Object(value) === value;
      const mode = options.mode ?? view.mode ?? "cell", drawer = options.drawer ?? view.drawer ?? "phone";
      // Hooks are functions, maps are objects, and the mode and drawer are known words.
      if (!object(options) || !object(view) || ["isEditable", "validateRow", "commit"].some(name => options[name] != null && typeof options[name] !== "function") ||
          ["validators", "lookups", "editors", "formatters"].some(name => options[name] != null && !object(options[name])) ||
          !["cell", "row"].includes(mode) || !["phone", "always", "never"].includes(drawer)) throw new Error("CanopyX: invalid editing settings.");
      const editors = Object.assign({}, EDIT_EDITORS, ...this.plugins.map(item => item.editors || {}), options.editors);
      for (const [name, editor] of Object.entries(editors)) if (!editor || typeof editor.create !== "function")
        throw new Error("CanopyX: the editor " + name + " needs a create function.");
      const labels = {};
      for (const [name, text] of Object.entries(EDIT_LABELS)) labels[name] = this.labels[name] || text;
      // The core accepts every gridEdit… name for this part (gridEditAsText is its own); the part knows which exist.
      for (const name of Object.keys(this.labels)) if (/^gridEdit[A-Z]/.test(name) && name !== "gridEditAsText" && !Object.hasOwn(EDIT_LABELS, name))
        throw new Error("CanopyX: there is no label '" + name + "'.");
      const specs = new Map(this.columns.filter(column => column.editable).map(column => [column.id, editSpec(column, editors, this.columns)]));
      const limit = options.undoLimit ?? 100;
      if (!Number.isInteger(limit) || limit < 0 || limit > 10000) throw new Error("CanopyX: editing.undoLimit must be an integer from 0 to 10000.");
      this.edit = { options, mode, drawer, labels, editors, specs, limit, changes: new Map(), undo: [], redo: [], session: null, group: null,
        checks: new Map(), messages: new Map(), sequence: 0, bar: options.editBar ?? view.editBar ?? true };
      this.editReadOnly ??= !!(options.readOnly ?? view.readOnly);
      this.buildEditing();
      this.version++; this.scheduleRender();
    },

    // Whether a loaded record's cell takes an editor: the column opts in, the grid is not read-only and isEditable agrees.
    canEditCell(record, id) {
      const spec = this.edit?.specs.get(id), test = this.edit?.options.isEditable;
      return !!spec && !this.editReadOnly && !!record && (!test || test(record, id) !== false);
    },

    // The loaded record with an id: the cached row, else the record its changes were made on, else an inline row.
    editRecord(id) {
      for (const row of this.rowCache.values()) if (row.key === id) return row.h;
      const change = this.edit.changes.get(id)?.row;
      if (change || this.view.source.kind !== "inline") return change;
      // A copy: unsaved values never reach the inline dataset that queries read.
      const row = this.view.rows.find(item => item.id === id);
      return row && JSON.parse(JSON.stringify(row));
    },

    // Applies one value: the cancelable cellValueChanging event first, then the change set, the undo history, validation
    // and cellValueChanged. A value equal to the one the row started from takes the change back. False when cancelled.
    editApply(id, spec, value, source, record = this.editRecord(id), checked) {
      if (!record) throw new Error("CanopyX: the record " + id + " is not loaded.");
      const state = this.edit, cells = record.cells, previous = cellValue(cells[spec.id]);
      if (editSame(previous, value)) return true;
      const detail = { id, column: spec.id, value, previous, row: editCopy(record), source };
      // Range batches preflight their changing hooks before their final validation and any mutation.
      if (!checked?.prepared && !this.emit("cellValueChanging", detail)) return false;
      const entry = state.changes.get(id) || { id, original: Object.create(null), values: Object.create(null), errors: Object.create(null), error: null };
      if (!Object.hasOwn(entry.original, spec.id)) entry.original[spec.id] = cells[spec.id];
      const original = entry.original[spec.id];
      if (editSame(cellValue(original), value)) {
        if (original === undefined) delete cells[spec.id]; else cells[spec.id] = original;
        delete entry.original[spec.id]; delete entry.values[spec.id]; delete entry.errors[spec.id];
        state.checks.delete(id + "\u0000" + spec.id); entry.checked?.delete(spec.id);
      } else {
        cells[spec.id] = editCell(original, value, this.editText(spec, value, record));
        entry.values[spec.id] = value;
      }
      entry.row = record; entry.error = entry.rowError = null; entry.rowErrors = Object.create(null); entry.committed = false;
      if (entry.status !== "saving") entry.status = undefined;
      // A row that is saving keeps its entry, so the answer still finds it.
      if (Object.keys(entry.values).length || entry.status === "saving") state.changes.set(id, entry); else state.changes.delete(id);
      if (source !== "undo" && source !== "redo") {
        const step = { id, column: spec.id, before: previous, after: value };
        if (state.group) state.group.push(step);
        else if (state.limit) { state.undo.push([step]); if (state.undo.length > state.limit) state.undo.shift(); state.redo.length = 0; }
      }
      if (Object.hasOwn(entry.values, spec.id)) this.editCheck(id, spec, checked);
      this.editChanged();
      this.emit("cellValueChanged", { ...detail, row: editCopy(record) });
      return true;
    },

    // The text an edited cell shows: the host's formatter for the column (the one its source text comes from), else the
    // label of a select or lookup choice, else none, so the column's default formatting applies as it does to every cell.
    editText(spec, value, record) {
      const formatters = this.edit.options.formatters, format = spec && formatters && Object.hasOwn(formatters, spec.id) ? formatters[spec.id] : null;
      if (typeof format === "function" && value != null) return String(format(value, editCopy(record)));
      const option = spec && (spec.options || this.edit.seen?.get(spec.id))?.find(item => item.value === value);
      return option && option.label !== String(value) ? option.label : undefined;
    },

    // Runs several changes as one undo step (a row edit, a drawer save, a revert).
    editGroup(run) {
      const state = this.edit, outer = state.group, steps = state.group = outer || [];
      try { return run(); } finally {
        state.group = outer;
        if (!outer && steps.length && state.limit) { state.undo.push(steps); if (state.undo.length > state.limit) state.undo.shift(); state.redo.length = 0; }
      }
    },

    // Repaints the changed cells and the edit bar.
    editChanged() {
      if (this.formatStarted) { this.formatVersion++; this.formatStatsKey = undefined; }
      this.version++; this.scheduleRender(); this.syncEditBar();
    },

    getChanges() {
      return this.editEntries().map(entry => {
        const change = { id: entry.id, values: entry.values, original: Object.create(null) };
        for (const id of Object.keys(entry.values)) change.original[id] = cellValue(entry.original[id]);
        const errors = editErrors(entry), error = entry.error || entry.rowError;
        if (Object.keys(errors).length) change.errors = errors;
        if (error) change.error = error;
        if (entry.status) change.status = entry.status;
        return editCopy(change);
      });
    },

    hasChanges() { return this.editEntries().length > 0; },
    // The rows with changes (a saving row whose values were all taken back has none).
    editEntries() { return [...this.edit.changes.values()].filter(entry => Object.keys(entry.values).length); },

    // A host's own change: the same events, history and checks as an edit, without the read-only rules (the host decides).
    async setCellValue(id, column, value) {
      requireIdentifier(id, "edited row ID");
      const spec = this.edit.specs.get(column), record = this.editRecord(id);
      if (!spec || !record) throw new Error("CanopyX: setCellValue needs a loaded record and an editable column.");
      if (!editScalar(value)) throw new Error("CanopyX: a cell value is a string, a finite number, a boolean or null.");
      if (this.edit.session?.id === id && this.edit.session.fields.has(column)) this.editClose(false);
      if (!this.editApply(id, spec, value, "api", record)) return editCopy({ applied: false, valid: true });
      await this.edit.checks.get(id + "\u0000" + column)?.promise;
      const error = editErrors(this.edit.changes.get(id) || { errors: {} })[column] || null;
      return editCopy({ applied: true, valid: !error, ...(error ? { error } : {}) });
    },

    // Puts the rows (all of them by default) back to the values they started from, as one step undo brings back.
    revertChanges(ids) {
      if (ids !== undefined && !Array.isArray(ids)) throw new Error("CanopyX: revertChanges takes an array of row IDs.");
      this.cancelEdit();
      this.editGroup(() => {
        for (const id of ids ?? [...this.edit.changes.keys()]) {
          const entry = this.edit.changes.get(id);
          if (entry) for (const column of Object.keys(entry.values))
            this.editApply(id, this.edit.specs.get(column), cellValue(entry.original[column]), "revert", entry.row);
        }
      });
    },

    canUndo() { return this.edit.undo.length > 0; },
    canRedo() { return this.edit.redo.length > 0; },
    undo() { return this.editHistory(this.edit.undo, this.edit.redo, "before", "undo"); },
    redo() { return this.editHistory(this.edit.redo, this.edit.undo, "after", "redo"); },
    editHistory(from, to, key, source) {
      if (!from.length || this.destroyed) return false;
      this.cancelEdit();
      const steps = from.pop(), order = key === "before" ? [...steps].reverse() : steps;
      for (const step of order) {
        const record = this.editRecord(step.id), spec = this.edit.specs.get(step.column);
        if (record && spec) this.editApply(step.id, spec, step[key], source, record);
      }
      to.push(steps);
      const last = this.edit.specs.get(order[order.length - 1].column);
      this.editAnnounce(fill(this.edit.labels[source === "undo" ? "gridEditUndone" : "gridEditRedone"], { column: last ? last.column.title : "" }));
      this.syncEditBar();
      return true;
    },

    setReadOnly(value) {
      if (typeof value !== "boolean") throw new Error("CanopyX: setReadOnly takes a boolean.");
      if (value) this.cancelEdit();
      this.editReadOnly = value; this.version++; this.scheduleRender(); this.syncEditBar();
    }
  });

  // Rows that arrive again (scrolling back, a new query or page) show their pending values; the change keeps the record.
  const EDIT_STORE_PAGE = DataGrid.prototype.storePage;
  DataGrid.prototype.storePage = function (page) {
    const changes = this.edit?.changes;
    if (changes?.size) for (const item of page.items) {
      const entry = changes.get(item.id);
      if (entry) for (const [column, value] of Object.entries(entry.values)) {
        item.cells[column] = editCell(item.cells[column], value, this.editText(this.edit.specs.get(column), value, item));
      }
    }
    const result = EDIT_STORE_PAGE.call(this, page);
    if (changes?.size) for (const row of this.pages.get(page.offset)?.rows || []) if (changes.has(row.key)) changes.get(row.key).row = row.h;
    // New data (a query, a reload) replaced the row an editor was open on: its values go to the row as it is now.
    const session = this.edit?.session;
    if (session && this.rowCache.get(session.wrapper._ri) !== session.wrapper) this.editClose(true, true);
    return result;
  };
