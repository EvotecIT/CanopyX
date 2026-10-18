  // ---------- editing: row commit, batch commit and the gridCommit protocol ----------
  // A row commits when the reader leaves a row they changed (or presses Enter in full-row mode, or commitRow runs): once
  // its checks pass, the cancelable canopyx:rowCommit event and onRowCommit receive it. A handler that answers (a returned
  // result, true, a promise, or detail.respondWith) saves the row; without an answer the row stays in the batch.
  // commitChanges sends every valid changed row in one gridCommit document to editing.commit, else to the source's commit
  // (a remote source posts it to its commit endpoint); an inline grid without either accepts the rows in the page, and a
  // hosted grid without either saves nothing. The writer answers with a gridCommitResult: saved rows become the new
  // starting values (with the canonical cells the writer returns), rows in error or conflict keep their changes and show
  // the message. The grid keeps reading pages at the revision it accepted; the result's revision tells the host when to reload.

  // Checks a writer's answer against the rows asked for; a row the answer leaves out was not saved.
  function editCommitAnswer(result, batch, columns) {
    checkDocument(result, "gridCommitResult");
    if (result.view !== batch.view || !Array.isArray(result.rows)) throw new Error("CanopyX: the commit result does not answer its batch.");
    const asked = new Set(batch.rows.map(row => row.id)), inserts = new Set(batch.rows.filter(row => row.op === "insert").map(row => row.id)), rows = new Map(), text = value => value === undefined || typeof value === "string";
    for (const row of result.rows) {
      if (!row || !asked.has(row.id) || rows.has(row.id) || !["saved", "error", "conflict"].includes(row.status) || !text(row.error) ||
          row.errors !== undefined && (Object(row.errors) !== row.errors || Array.isArray(row.errors) || !Object.values(row.errors).every(text)) ||
          row.cells !== undefined && (row.status !== "saved" || Object(row.cells) !== row.cells) ||
          row.newId !== undefined && (row.status !== "saved" || !inserts.has(row.id) || typeof row.newId !== "string"))
        throw new Error("CanopyX: malformed commit result row.");
      if (row.newId !== undefined) requireIdentifier(row.newId, "saved row ID");
      if (row.cells !== undefined) validateGridRows([{ id: row.id, cells: row.cells }], columns);
      rows.set(row.id, row);
    }
    return { rows, revision: result.revision };
  }

  Object.assign(DataGrid.prototype, {
    // The row the reader moves to; leaving a changed row commits it once.
    editEnterRow(id) {
      const state = this.edit, previous = state.lastRow, entry = previous && previous !== id ? state.changes.get(previous) : null;
      state.lastRow = id;
      if (entry && !entry.committed && !entry.running && entry.status !== "saving" && state.session?.id !== previous)
        this.commitRow(previous).catch(error => this.emit("error", { error }));
    },

    // One commit of a row at a time: a second request while it runs, or while the row saves, gets the same answer.
    async commitRow(id) {
      requireIdentifier(id, "committed row ID");
      const state = this.edit;
      if (state.session?.id === id && !this.editClose(true)) return editCopy({ id, ok: false, status: "invalid", errors: {} });
      const entry = state.changes.get(id);
      if (!entry || !Object.keys(entry.values).length && entry.status !== "saving") return editCopy({ id, ok: true, status: "unchanged" });
      if (entry.status === "saving") return entry.saving;
      return entry.running ||= this.editCommitRow(id, entry).finally(() => { entry.running = null; });
    },

    async editCommitRow(id, entry) {
      const state = this.edit, check = editCurrentValidation(this, await this.editValidateRow(id));
      if (!check.valid) return editCopy({ id, ok: false, status: "invalid", errors: check.errors, error: check.error });
      if (state.changes.get(id) !== entry || entry.status === "saving") return entry.saving || editCopy({ id, ok: true, status: "unchanged" });
      let response, answered = false;
      const respondWith = value => { if (answered) throw new Error("CanopyX: the row commit has an answer already."); answered = true; response = value; };
      const detail = { ...this.editChangeOf(entry), row: editCopy(entry.row), revision: this.snapshot?.revision ?? null, respondWith };
      const admitted = { entry, values: { ...detail.values } };
      let go = this.host.dispatchEvent(new CustomEvent("canopyx:rowCommit", { detail, cancelable: true })), result;
      if (typeof this.opts.onRowCommit === "function") {
        try { result = this.opts.onRowCommit(detail); } catch (error) { result = Promise.reject(error); }
        if (result === false) go = false;
        else if (result !== undefined && !answered) respondWith(result === true ? { status: "saved" } : result);
      }
      if (!go) return editCopy({ id, ok: false, status: "cancelled" });
      entry.committed = true;
      if (!answered) return editCopy({ id, ok: true, status: "pending" });
      return this.editSave([admitted], () => Promise.resolve(response).then(value =>
        editCommitAnswer({ protocol: PROTOCOL, type: "gridCommitResult", view: this.view.id, rows: [value === true ? { id, status: "saved" } : { ...value, id }] },
          { view: this.view.id, rows: [entry.inserted ? { id, op: "insert" } : { id }] }, this.view.columns))).then(rows => rows[0]);
    },

    async commitChanges(options = {}) {
      if (Object(options) !== options || options.ids !== undefined && !Array.isArray(options.ids)) throw new Error("CanopyX: invalid commit options.");
      const state = this.edit, open = state.session;
      if (open && !this.editClose(true)) return editCopy({ ok: false, saved: 0, failed: 1, rows: [{ id: open.id, ok: false, status: "invalid", errors: {} }] });
      const ready = id => state.changes.get(id)?.status !== "saving" && Object.keys(state.changes.get(id)?.values || {}).length > 0;
      const ids = [...new Set(options.ids ?? state.changes.keys())];
      ids.forEach(id => requireIdentifier(id, "committed row ID"));
      const checks = (await Promise.all(ids.filter(ready).map(id => this.editValidateRow(id))))
        .map(result => editCurrentValidation(this, result));
      const rows = checks.filter(check => !check.valid).map(check => ({ id: check.id, ok: false, status: "invalid", errors: check.errors, error: check.error }));
      const valid = checks.filter(check => check.valid && ready(check.id)).map(check => check.id);
      let revision;
      if (valid.length) {
        const batch = editCopy({ protocol: PROTOCOL, type: "gridCommit", view: this.view.id, revision: this.snapshot?.revision ?? null,
          rows: valid.map(id => this.editChangeOf(state.changes.get(id))) });
        const writer = state.options.commit || (typeof this.source.commit === "function" ? (body, context) => this.source.commit(body, context) : null);
        const local = !writer && this.view.source.kind === "inline";
        const admitted = valid.map((id, index) => ({ entry: state.changes.get(id), values: batch.rows[index].values }));
        rows.push(...await this.editSave(admitted, async signal => {
          if (writer) { const answer = editCommitAnswer(await writer(batch, { signal }), batch, this.view.columns); revision = answer.revision; return answer; }
          return { rows: new Map(local ? valid.map(id => [id, { id, status: "saved" }]) : []) };
        }, options.signal));
      }
      const saved = rows.filter(row => row.ok).length;
      const result = editCopy({ ok: saved === rows.length, saved, failed: rows.length - saved, rows, ...(revision ? { revision } : {}) });
      if (rows.length) this.editAnnounce([saved && fill(state.labels.gridEditSaved, { count: saved }), result.failed && fill(state.labels.gridEditFailed, { count: result.failed })].filter(Boolean).join(" · "));
      this.emit("commit", result);
      return result;
    },

    // Sends rows to a writer and applies its answer; resolves with a result per row. Each row's saving promise is the
    // answer a commit of that row gets while it saves.
    editSave(admitted, write, signal) {
      const entries = admitted.map(row => row.entry);
      // A row hook may create a newer draft before it answers. Accept only the entry and values it was offered.
      for (const { entry, values } of admitted) { entry.status = "saving"; entry.saved = { ...values }; entry.error = null; }
      this.editChanged();
      const run = this.runGridHook(write, signal).then(answer => this.editSaved(entries, answer, null), error => this.editSaved(entries, null, error));
      entries.forEach((entry, index) => { entry.saving = run.then(results => results[index]); });
      return run;
    },

    async editSaved(entries, answer, failure) {
      const state = this.edit;
      const results = entries.map(entry => {
        const row = answer?.rows.get(entry.id), id = entry.id;
        let problem = failure;
        if (state.changes.get(id) !== entry) return { id, ok: false, status: "superseded" };
        entry.status = undefined;
        if (row?.status === "saved") {
          try {
            if (entry.inserted) { this.editAcceptInsert(entry, row.cells, row.newId); return { id, ok: true, status: "saved", ...(row.newId && row.newId !== id ? { newId: row.newId } : {}) }; }
            this.editAccept(entry, row.cells); return { id, ok: true, status: "saved" };
          } catch (error) { problem = error; }
        }
        const status = row && row.status !== "saved" ? row.status : "error";
        entry.status = status; entry.saved = null;
        entry.error = row?.error || (status === "conflict" ? state.labels.gridEditConflict : problem ? fill(state.labels.gridEditRejected, { error: problem.message }) :
          row?.errors ? null : state.labels.gridEditNotSaved);
        for (const [column, message] of Object.entries(row?.errors || {})) if (Object.hasOwn(entry.values, column) && editMessage(message)) entry.errors[column] = message;
        if (!Object.keys(entry.values).length) state.changes.delete(id);
        return { id, ok: false, status, ...(entry.error ? { error: entry.error } : {}), ...(row?.errors ? { errors: row.errors } : {}) };
      });
      this.editChanged(); this.editRefreshMessage();
      // Saved local values can change result membership and order. Refresh the reader's latest intent, including a
      // pending query, page length or debounced search, rather than restoring the older accepted query. Hosts own refresh.
      if (!this.destroyed && this.view.source.kind === "inline" && (!this.opts.source || this.enhanceStore) && results.some(row => row.ok))
        await this.setQuery({ ...this.queryForChange(true), revision: undefined }, this.pendingPaging).catch(() => {});
      return results.map(editCopy);
    },

    // A saved row: the saved values become its starting values, the writer's canonical cells replace the shown ones, and an
    // inline grid keeps them in its rows so later queries sort and filter by them. A value changed while the row saved
    // (an edit, an undo) stays a change from the saved value.
    editAccept(entry, canonical) {
      const record = entry.row, local = this.view.source.kind === "inline" && (!this.opts.source || this.enhanceStore),
        inline = local ? this.view.rows.find(row => row.id === entry.id) : null;
      for (const [column, value] of Object.entries(entry.saved)) {
        const current = cellValue(record.cells[column]), saved = canonical && Object.hasOwn(canonical, column) ? canonical[column] :
          editCell(entry.original[column], value, this.editText(this.edit.specs.get(column), value, record));
        if (editSame(current, value) || editSame(current, cellValue(saved))) {
          delete entry.values[column]; delete entry.original[column]; delete entry.errors[column];
          record.cells[column] = saved;
        } else { entry.original[column] = saved; entry.values[column] = current; }
      }
      for (const [column, cell] of Object.entries(canonical || {})) {
        if (Object.hasOwn(entry.values, column) && !Object.hasOwn(entry.saved, column)) {
          if (editSame(entry.values[column], cellValue(cell))) { delete entry.values[column]; delete entry.original[column]; delete entry.errors[column]; }
          else entry.original[column] = cell;
        }
        if (!Object.hasOwn(entry.values, column)) record.cells[column] = cell;
      }
      if (inline) for (const column of new Set([...Object.keys(entry.saved), ...Object.keys(canonical || {})])) {
        const cell = Object.hasOwn(entry.values, column) ? entry.original[column] : record.cells[column];
        if (cell === undefined) delete inline.cells[column]; else inline.cells[column] = JSON.parse(JSON.stringify(cell));
      }
      // Both local source owners forget their previous result order. Enhanced rows retain their page-order tie break.
      if (inline) {
        if (this.enhanceStore) this.enhanceStore.version++;
        else if (this.view.rowData) this.source.invalidate();
        else this.source = inlineGridSource(this.view);
      }
      if (local) RECORD_IMPL.invalidate?.(this, entry.id);
      entry.saved = null; entry.error = null; entry.committed = false;
      if (!Object.keys(entry.values).length) this.edit.changes.delete(entry.id);
    }
  });
