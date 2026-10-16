  // ---------- editing: new rows ----------
  // insertRow adds a record the writer has not stored yet (a calendar creates events this way): it joins the change set as an
  // insert with every editable value, shows at once (inline grids add it to their rows; a calendar shows it over hosted data),
  // is validated as an edit is, and commits as gridCommit row { op: "insert", id, values }. Its id is new-<n>, or the host's when it starts with new- too;
  // a writer that stores it under another identity answers newId and the row takes it. Until it is saved, undo removes it, redo
  // puts it back and revertChanges removes it; once saved it leaves the history (the protocol has no deletes).
  Object.assign(DataGrid.prototype, {
    async insertRow(input) {
      const result = this.editInsertNow(input, "api");
      if (!result.applied) return editCopy(result);
      const check = await this.editValidateRow(result.id);
      return editCopy({ id: result.id, applied: true, valid: check.valid, ...(check.valid ? {} : { errors: check.errors }) });
    },
    /** insertRow's synchronous half: the checks, canopyx:rowInserting, then the insert (validation follows). */
    editInsertNow(input, source) {
      if (Object(input) !== input || Object(input.cells) !== input.cells || Array.isArray(input.cells)) throw new Error("CanopyX: insertRow takes { id?, cells }.");
      const id = input.id ?? this.editNewId();
      requireIdentifier(id, "new row ID");
      // A new row's id says it is new: writers (and the .NET endpoint) refuse inserts under any other id.
      if (!id.startsWith("new-")) throw new Error("CanopyX: a new row ID starts with new-.");
      if (this.editRecord(id) || this.edit.changes.has(id)) throw new Error("CanopyX: a row " + id + " exists already.");
      const row = { id, cells: JSON.parse(JSON.stringify(input.cells)) };
      validateGridRows([row], this.view.columns);
      if (!this.emit("rowInserting", { id, row: editCopy(row) })) return { id, applied: false, valid: true };
      this.editInsert(row, source);
      return { id, applied: true };
    },
    /** Runs changes as one undo step that is kept only when run returns true: a half-made change leaves no step behind. */
    editGroupIf(run) {
      const state = this.edit, outer = state.group, steps = state.group = outer || [], mark = steps.length;
      let kept = false;
      try { kept = run() === true; return kept; } finally {
        state.group = outer;
        if (!kept) steps.length = mark;
        else if (!outer && steps.length && state.limit) { state.undo.push(steps); if (state.undo.length > state.limit) state.undo.shift(); state.redo.length = 0; }
      }
    },
    /** The grid owns its rows (inline data, or an enhanced table's store): new and removed rows change them in place. */
    editOwnsRows() { return this.view.source.kind === "inline" && (!this.opts.source || !!this.enhanceStore); },
    /** Rows came or went: the local source forgets its result, as editAccept does for saved values (compact data keeps its decoder). */
    editRowsChanged() {
      if (this.enhanceStore) this.enhanceStore.version++;
      else if (this.view.rowData && this.source.invalidate) this.source.invalidate();
      else this.source = inlineGridSource(this.view);
    },
    editNewId() {
      let id;
      do id = "new-" + (++this.edit.sequence); while (this.editRecord(id) || this.edit.changes.has(id));
      return id;
    },
    editInsert(row, source) {
      // A row already in the change set (a redo while its first insert is still saving) is not added twice.
      if (this.edit.changes.has(row.id)) return false;
      const state = this.edit, entry = { id: row.id, inserted: true, original: Object.create(null), values: Object.create(null), errors: Object.create(null), error: null,
        row: JSON.parse(JSON.stringify(row)), committed: false };
      for (const column of state.specs.keys()) entry.values[column] = cellValue(row.cells[column]) ?? null;
      state.changes.set(row.id, entry); state.inserted.set(row.id, entry.row);
      if (this.editOwnsRows()) { this.view.rows.push(JSON.parse(JSON.stringify(row))); this.editRowsChanged(); }
      if (source !== "undo" && source !== "redo") {
        const step = { id: row.id, insert: JSON.parse(JSON.stringify(row)) };
        if (state.group) state.group.push(step);
        else if (state.limit) { state.undo.push([step]); if (state.undo.length > state.limit) state.undo.shift(); state.redo.length = 0; }
      }
      for (const column of state.specs.keys()) this.editCheck(row.id, state.specs.get(column));
      this.editChanged();
      this.emit("rowAdded", { id: row.id, row: editCopy(entry.row) });
      if (this.editOwnsRows()) Promise.resolve(this.reload?.()).catch(() => {});
    },
    /** Takes a new row out; forget also drops the undo steps that added it (revertChanges), as nothing can bring it back. */
    editRemoveInserted(id, forget) {
      const state = this.edit;
      // A row being saved stays until the writer answers, so a stored record never disappears from the grid.
      if (!state.inserted.has(id) || state.changes.get(id)?.status === "saving") return false;
      state.inserted.delete(id); state.changes.delete(id);
      if (forget) for (const list of [state.undo, state.redo]) for (let at = list.length - 1; at >= 0; at--) if (list[at].some(step => step.insert && step.id === id)) list.splice(at, 1);
      if (this.editOwnsRows()) {
        const at = this.view.rows.findIndex(row => row.id === id);
        if (at >= 0) { this.view.rows.splice(at, 1); this.editRowsChanged(); }
        Promise.resolve(this.reload?.()).catch(() => {});
      }
      this.editChanged();
      this.emit("rowRemoved", { id });
      return true;
    },
    /** A saved new row: its values are stored; it takes the writer's identity and canonical cells. */
    editAcceptInsert(entry, canonical, newId) {
      const state = this.edit, from = entry.id;
      let to = newId ?? from;
      if (to !== from) requireIdentifier(to, "saved row ID");
      // An identity another row of the grid holds would make two rows one: the row keeps its id and the writer hears of it.
      if (to !== from && (state.changes.has(to) || this.editOwnsRows() && this.view.rows.some(row => row.id === to))) {
        this.emit("error", { error: new Error("CanopyX: the writer stored a new row as " + to + ", which another row has."), id: from });
        to = from;
      }
      // The record as stored: the writer's canonical cells, else the values sent. Values changed while it was saving are kept
      // apart and become an ordinary change of the stored record below.
      const record = entry.row, later = entry.saved ? Object.keys(entry.values).filter(column => JSON.stringify(entry.values[column]) !== JSON.stringify(entry.saved[column] ?? null) && state.specs.has(column)) : [];
      for (const column of later) record.cells[column] = canonical && Object.hasOwn(canonical, column) ? canonical[column] : entry.saved[column];
      for (const [column, cell] of Object.entries(canonical || {})) record.cells[column] = cell;
      record.id = to;
      state.changes.delete(from); state.inserted.delete(from);
      if (this.editOwnsRows()) {
        const inline = this.view.rows.find(row => row.id === from);
        if (inline) { inline.id = to; for (const column of Object.keys(entry.saved || {})) if (Object.hasOwn(record.cells, column)) inline.cells[column] = JSON.parse(JSON.stringify(record.cells[column])); }
        this.editRowsChanged();
      }
      // A stored row cannot be taken back (gridCommit has no deletes): the undo steps that added it leave the history, with the
      // changes grouped with them, so undo never half-reverts a change. Later steps follow the row to its stored identity.
      for (const list of [state.undo, state.redo]) for (let at = list.length - 1; at >= 0; at--) if (list[at].some(step => step.insert && step.id === from)) list.splice(at, 1);
      if (to !== from) for (const steps of [...state.undo, ...state.redo]) for (const step of steps) if (step.id === from) { step.id = to; if (step.insert) step.insert.id = to; }
      if (to !== from) this.emit("rowIdChanged", { from, to });
      if (later.length) {
        const outer = state.group, target = this.editRecord(to) || record;
        state.group = [];
        try { for (const column of later) this.editApply(to, state.specs.get(column), entry.values[column], "accept", target); }
        finally { state.group = outer; }
      }
      // The table's cached rows of an inline grid take the stored identity too.
      if (to !== from && this.editOwnsRows()) Promise.resolve(this.reload?.()).catch(() => {});
    }
  });