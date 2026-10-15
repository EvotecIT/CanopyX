  // ---------- editing: opening, closing and moving editors in cells ----------
  // One session at a time: an editor in one cell, or in full-row mode one in each editable visible cell of a row. Enter
  // applies and moves down (Shift+Enter up), Tab applies and edits the next editable cell (Shift+Tab the previous), Escape
  // closes without applying. In full-row mode Tab moves between the row's editors and Enter applies the row as one step
  // and commits it. A value that fails a synchronous check keeps its editor open with the message; focus that leaves the
  // grid applies what can be applied and leaves the cell marked when it is invalid.
  Object.assign(DataGrid.prototype, {
    editColumnIndex(id) { return this.visibleColumns().findIndex(column => column.id === id); },

    // An editor for a record's cell: the context its editor receives, the instance and the host element that holds it.
    editCreate(record, spec, mode, initial) {
      const state = this.edit, abort = new AbortController(), cell = record.cells[spec.id];
      const context = Object.freeze({ id: this.id + "-ed" + ++state.sequence, value: cellValue(cell), text: cellText(cell, spec.column, this.fmt),
        row: editCopy(record), column: Object.freeze({ id: spec.id, title: spec.column.title, kind: spec.column.kind }), editor: spec.editor,
        options: spec.options, rules: spec.rules, labels: Object.freeze({ ...this.labels, ...state.labels }), locale: this.lang, timeZone: this.local ? "local" : "utc",
        mode, initial, signal: abort.signal, lookupMinLength: spec.lookup ? spec.lookup.minLength : 1,
        commit: () => { (mode === "form" ? this.editFormSave() : this.endEdit()).catch(error => this.emit("error", { error })); },
        cancel: () => mode === "form" ? state.form?.dialog.close() : this.cancelEdit(),
        lookup: (search, signal) => this.editLookup(spec, search, record, signal), remember: option => this.editRemember(spec.id, option) });
      const instance = state.editors[spec.type].create(context);
      if (!instance || !(instance.element instanceof Element) || typeof instance.getValue !== "function")
        throw new Error("CanopyX: the editor " + spec.type + " must return an element and getValue.");
      const host = h("div", "cx-editor-host"), control = instance.control || instance.element;
      host.appendChild(instance.element);
      control.setAttribute("aria-label", fill(state.labels.gridEditCell, { column: spec.column.title }));
      return { spec, instance, host, control, abort, record };
    },

    editDispose(field) {
      field.abort.abort();
      try { field.instance.destroy?.(); } catch (error) { this.emit("error", { error }); }
      field.host.remove(); field.cell?.classList.remove("cx-editing");
    },

    // Validators see the completed row, and the same check can accompany its values into the change set.
    editPreview(record, values) {
      const preview = { ...record, cells: Object.assign(Object.create(null), record.cells) };
      for (const [spec, value] of values) if (!editSame(cellValue(record.cells[spec.id]), value))
        preview.cells[spec.id] = editCell(record.cells[spec.id], value, this.editText(spec, value, record));
      return preview;
    },

    // Opens the session synchronously on a rendered row; false when nothing there can be edited.
    editStart(wrapper, column, initial) {
      const state = this.edit, open = state.session;
      // A second request for the open cell (the click before a double click opened it) keeps that editor.
      if (open?.wrapper === wrapper && open.fields.has(column)) { open.fields.get(column).control.focus({ preventScroll: true }); return true; }
      if (open && !this.editClose(true)) return false;
      const element = this.rendered.get(wrapper);
      if (!element || wrapper.status || this.editReadOnly) return false;
      const cells = this.rowCells(element), visible = this.visibleColumns();
      const ids = (state.mode === "row" ? visible.map(item => item.id) : [column]).filter(id => this.canEditCell(wrapper.h, id) && this.editColumnIndex(id) >= 0);
      if (!ids.includes(column)) return false;
      const session = { id: wrapper.key, wrapper, mode: state.mode, fields: new Map() };
      for (const id of ids) {
        const field = this.editCreate(wrapper.h, state.specs.get(id), state.mode, id === column ? initial : undefined);
        field.cell = cells[this.editColumnIndex(id)];
        field.cell.classList.add("cx-editing"); field.cell.appendChild(field.host);
        field.host.addEventListener("keydown", event => this.editKey(event, field));
        field.host.addEventListener("focusout", event => this.editBlur(event));
        session.fields.set(id, field);
      }
      state.session = session; state.lastRow = wrapper.key;
      const field = session.fields.get(column);
      this.revealInRow(field.cell, field.cell, cells[0]);
      field.instance.focus ? field.instance.focus() : field.control.focus({ preventScroll: true });
      if (typeof initial === "string" && field.control.setSelectionRange && /^(text|search)$/.test(field.control.type)) field.control.setSelectionRange(initial.length, initial.length);
      this.editShowMessage(field);
      return true;
    },

    async beginEdit(id, column, options = {}) {
      requireIdentifier(id, "edited row ID");
      if (this.destroyed || !this.acceptedQuery || this.pendingQuery || this.editReadOnly) return false;
      const wrapper = [...this.rowCache.values()].find(row => row.key === id);
      if (!wrapper) return false;
      const target = column ?? this.visibleColumns().find(item => this.canEditCell(wrapper.h, item.id))?.id;
      if (!target || !this.canEditCell(wrapper.h, target) || this.editColumnIndex(target) < 0) return false;
      const session = this.edit.session;
      if (session && session.id === id && session.fields.has(target)) { session.fields.get(target).control.focus({ preventScroll: true }); return true; }
      if (session && !this.editClose(true)) return false;
      this.setFocus(wrapper, false);
      return this.editStart(wrapper, target, options.initial);
    },

    // Closes the session. With apply its values go into the change set, as one undo step; a value that fails a synchronous
    // check keeps the editors open and shows its message (false), unless force applies the valid values and drops the rest.
    editClose(apply, force) {
      const state = this.edit, session = state.session;
      if (!session) return true;
      const values = [], record = this.editRecord(session.id) || session.wrapper.h;
      if (apply) for (const field of session.fields.values()) {
        const parse = field.instance.error?.() || null, value = parse ? undefined : field.instance.getValue();
        const message = parse || (!editScalar(value) ? fill(state.labels.gridEditChoice, { column: field.spec.column.title }) : null);
        if (message && !force) { this.editShowMessage(field, message); this.editAnnounce(message); return false; }
        if (!parse && editScalar(value)) values.push([field.spec, value, field]);
      }
      const preview = this.editPreview(record, values), shape = JSON.stringify(preview.cells);
      for (const item of values) {
        const result = this.editRules(item[0], item[1], preview), message = result && typeof result.then !== "function" ? result : null;
        if (message && !force) { this.editShowMessage(item[2], message); this.editAnnounce(message); return false; }
        item[2] = { result, row: shape };
      }
      state.session = null;
      for (const field of session.fields.values()) this.editDispose(field);
      this.editHideMessage();
      this.editGroup(() => { for (const [spec, value, checked] of values) this.editApply(session.id, spec, value, "edit", record, checked); });
      return true;
    },

    async endEdit() {
      const session = this.edit.session;
      if (!session) return true;
      const inside = [...session.fields.values()].some(field => field.host.contains(document.activeElement)), column = [...session.fields.keys()][0];
      if (!this.editClose(true)) return false;
      if (inside) this.editFocusCell(session.wrapper, column);
      if (session.mode === "row") await this.commitRow(session.id);
      return true;
    },

    cancelEdit() {
      const session = this.edit?.session;
      if (!session) return;
      const field = [...session.fields.values()].find(item => item.host.contains(document.activeElement));
      this.editClose(false);
      if (field) this.editFocusCell(session.wrapper, field.spec.id);
    },

    isEditing() { return !!this.edit.session; },

    editFocusCell(wrapper, column) {
      const index = this.editColumnIndex(column);
      if (this.rendered.has(wrapper) && index >= 0) this.focusCell(wrapper, index, null); else this.setFocus(wrapper, true);
    },

    // Keys inside an editor never reach the grid's own navigation.
    editKey(event, field) {
      event.stopPropagation();
      const session = this.edit.session;
      if (event.defaultPrevented || event.isComposing || !session || event.altKey || event.ctrlKey || event.metaKey) return;
      const { wrapper, mode } = session, column = field.spec.id;
      if (event.key === "Escape") { event.preventDefault(); this.cancelEdit(); }
      else if (event.key === "Enter") {
        event.preventDefault();
        if (!this.editClose(true)) return;
        this.editFocusCell(wrapper, column);
        if (mode === "row") this.commitRow(wrapper.key).catch(error => this.emit("error", { error }));
        const index = wrapper._ri + (event.shiftKey ? -1 : 1), bounds = this.rowBounds();
        if (index >= bounds.first && index <= bounds.last) this.focusResult(index, true, this.editColumnIndex(column), null).catch(() => {});
      } else if (event.key === "Tab") {
        event.preventDefault();
        if (mode === "row") {
          const fields = [...session.fields.values()], next = fields[(fields.indexOf(field) + (event.shiftKey ? fields.length - 1 : 1)) % fields.length];
          next.control.focus({ preventScroll: true }); this.revealInRow(next.cell, next.cell, this.rowCells(this.rendered.get(wrapper))[0]); this.editShowMessage(next);
        } else if (this.editClose(true)) this.editMoveAcross(wrapper, column, event.shiftKey ? -1 : 1).catch(() => {});
      }
    },

    // The next editable cell across the row, then on the next row; focus stays on the cell when there is none.
    async editMoveAcross(wrapper, column, step) {
      const ids = this.visibleColumns().map(item => item.id), bounds = this.rowBounds();
      for (let index = wrapper._ri, start = ids.indexOf(column) + step, pass = 0; pass < 2; pass++, index += step, start = step > 0 ? 0 : ids.length - 1) {
        if (index < bounds.first || index > bounds.last) break;
        const row = pass ? await this.waitForRow(index, this.queryEpoch) : wrapper;
        if (!row || row.status) break;
        for (let at = start; at >= 0 && at < ids.length; at += step)
          if (this.canEditCell(row.h, ids[at])) { this.setFocus(row, false); if (this.editStart(row, ids[at])) return; }
      }
      this.editFocusCell(wrapper, column);
    },

    // Focus leaving the session's editors applies them, except when the page itself lost focus or it moved to the
    // session's own popovers (a lookup list, the message).
    editBlur(event) {
      const session = this.edit.session, next = event.relatedTarget;
      if (!session || next && [...session.fields.values()].some(field => field.host.contains(next))) return;
      setTimeout(() => {
        if (this.edit.session !== session || !document.hasFocus() || [...session.fields.values()].some(field => field.host.contains(document.activeElement))) return;
        this.editClose(true, true);
        if (session.mode === "row") this.commitRow(session.id).catch(error => this.emit("error", { error }));
      });
    }
  });
