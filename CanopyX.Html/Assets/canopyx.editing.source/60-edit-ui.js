  // ---------- editing: keys, pointer, marks on cells, messages and the edit bar ----------
  // F2, Enter or a typed character edit the focused cell (Backspace and Delete start it empty); a double click, or a click
  // on the cell that already has focus, edits it too. Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes, while focus is in
  // the grid and not in a text field. Changed cells carry a mark and "Edited" for screen readers; invalid cells carry
  // aria-invalid and their message through aria-describedby, and show it beside the cell while they have focus.
  GRID_ICONS.undo = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
  GRID_ICONS.redo = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>';
  const editAttr = (element, name, value) => { if (value == null) element.removeAttribute(name); else if (element.getAttribute(name) !== value) element.setAttribute(name, value); };

  Object.assign(DataGrid.prototype, {
    buildEditing() {
      const state = this.edit, signal = this.lifetime.signal, grid = this.grid, labels = state.labels;
      state.tip = h("div", "cx-edit-tip"); state.tip.id = this.id + "-edit-tip"; state.tip.popover = "manual";
      state.notes = h("div", "cx-sr-only"); state.notes.id = this.id + "-edit-notes";
      this.host.append(state.tip, state.notes);
      grid.addEventListener("keydown", event => this.editGridKey(event), { capture: true, signal });
      grid.addEventListener("pointerdown", event => { const cell = event.target.closest?.(".cx-cell"); state.armed = cell && cell === document.activeElement ? cell : null; }, { capture: true, signal });
      grid.addEventListener("click", event => this.editClick(event), { signal });
      grid.addEventListener("dblclick", event => {
        const at = !this.phone && this.editCellAt(event.target);
        if (at) { event.stopPropagation(); this.setFocus(at.row, false); this.editStart(at.row, at.column); }
      }, { capture: true, signal });
      this.canvas.addEventListener("focusin", event => {
        const row = event.target.closest(".cx-row")?._w;
        if (row && !row.status) this.editEnterRow(row.key);
        this.editRefreshMessage();
      }, { signal });
      this.canvas.addEventListener("focusout", event => { if (!event.relatedTarget || !this.canvas.contains(event.relatedTarget)) this.editHideMessage(); }, { signal });
      grid.addEventListener("scroll", () => { if (state.tip.matches(":popover-open")) this.editRefreshMessage(); }, { passive: true, signal });
      signal.addEventListener("abort", () => { if (state.session) for (const field of state.session.fields.values()) this.editDispose(field); state.tip.remove(); state.notes.remove(); state.barEl?.remove(); }, { once: true });
      if (!state.bar) return;
      const bar = state.barEl = h("div", "cx-editbar"), status = h("span", "cx-editbar-text");
      state.barText = status.appendChild(h("span")); state.barErrors = status.appendChild(h("span", "cx-editbar-errors"));
      status.setAttribute("role", "status");
      const act = run => () => Promise.resolve().then(run).catch(error => this.emit("error", { error }));
      const icon = (name, text, run) => { const button = gridDecorateButton(gridButton("", act(run)), name, true); button.classList.add("icon"); button.setAttribute("aria-label", text); button.title = text; return button; };
      state.undoButton = icon("undo", labels.gridEditUndo, () => this.undo());
      state.redoButton = icon("redo", labels.gridEditRedo, () => this.redo());
      state.discardButton = gridDecorateButton(gridButton(labels.gridEditDiscard, act(() => this.revertChanges())), null, true);
      state.saveButton = gridDecorateButton(gridButton(labels.gridEditSave, act(() => this.commitChanges())), "check");
      state.saveButton.classList.add("cx-edit-save");
      bar.append(status, state.undoButton, state.redoButton, state.discardButton, state.saveButton);
      (this.spacer && this.spacer.parentNode === this.toolbar ? this.spacer : this.toolbar.lastChild)?.after(bar);
      this.syncEditBar();
    },

    editGridKey(event) {
      const state = this.edit;
      if (event.defaultPrevented || event.isComposing || event.target.closest(".cx-editor-host")) return;
      const key = event.key.toLowerCase(), command = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (command && (key === "z" || key === "y") && !event.target.closest("input,textarea,select,[contenteditable]")) {
        event.preventDefault(); event.stopPropagation();
        if (key === "y" || event.shiftKey) this.redo(); else this.undo();
        return;
      }
      const at = !command && !event.altKey && this.editCellAt(event.target, true);
      if (!at) return;
      const typed = event.key.length === 1 && event.key !== " ", empty = event.key === "Backspace" || event.key === "Delete";
      if ((typed || empty || event.key === "F2" || event.key === "Enter") && this.editStart(at.row, at.column, typed ? event.key : empty ? "" : undefined)) {
        event.preventDefault(); event.stopPropagation();
      }
      if (state.session === null && event.key === "Escape") this.editHideMessage();
    },

    // The editable cell an event happened in (with own, only the cell itself): its row and column.
    editCellAt(target, own) {
      const cell = target.closest?.(".cx-cell"), element = cell?.parentNode, row = element?._w;
      if (!row || row.status || own && target !== cell || target.closest(".cx-editor-host")) return null;
      const column = this.visibleColumns()[this.rowCells(element).indexOf(cell)];
      return column && this.canEditCell(row.h, column.id) ? { row, column: column.id, cell } : null;
    },

    // A plain click puts focus on an editable cell (the grid's click focused its row); a second click edits it.
    editClick(event) {
      const at = !this.phone && !event.target.closest("a,button,input,select,textarea,[contenteditable]") && this.editCellAt(event.target);
      if (!at || event.detail > 1) return;
      if (this.edit.armed === at.cell) this.editStart(at.row, at.column);
      else this.focusCell(at.row, this.editColumnIndex(at.column), null);
    },

    // A hidden note screen readers hear through aria-describedby; the same key reuses its element.
    editNote(key, text) {
      const state = this.edit;
      let note = state.messages.get(key);
      if (!note) { note = h("span"); note.id = this.id + "-en" + ++state.sequence; state.notes.appendChild(note); state.messages.set(key, note); }
      if (note.textContent !== text) setText(note, text);
      return note.id;
    },

    // Marks the changed, invalid and read-only cells of a painted row, and keeps the open editors in their cells.
    paintEdits(element, row) {
      const state = this.edit, entry = state.changes.get(row.key), session = state.session?.wrapper === row ? state.session : null;
      const rowError = entry && (entry.error || entry.rowError);
      element.classList.toggle("cx-row-invalid", !!rowError);
      editAttr(element, "aria-describedby", rowError ? this.editNote("\u0001" + row.key, rowError) : null);
      editAttr(element, "aria-busy", entry?.status === "saving" ? "true" : null);
      const errors = entry ? editErrors(entry) : {};
      this.cols.forEach((column, index) => {
        const slot = element._cells[index], cell = slot.cell, dirty = !!entry && Object.hasOwn(entry.values, column.id), error = errors[column.id];
        const editable = state.specs.has(column.id) && this.canEditCell(row.h, column.id), field = session?.fields.get(column.id);
        cell.classList.toggle("cx-dirty", dirty); cell.classList.toggle("cx-invalid", !!error); cell.classList.toggle("cx-editable", editable);
        editAttr(cell, "aria-readonly", editable ? null : "true"); editAttr(cell, "aria-invalid", error ? "true" : null);
        editAttr(cell, "aria-describedby", [dirty && this.editNote("edited", state.labels.gridEditEdited), error && this.editNote(row.key + "\u0000" + column.id, error)].filter(Boolean).join(" ") || null);
        if (field && field.cell !== cell) { field.cell.classList.remove("cx-editing"); field.cell = cell; }
        if (field) { cell.classList.add("cx-editing"); if (field.host.parentNode !== cell) cell.appendChild(field.host); }
      });
    },

    // The message of the cell or editor that has focus, beside it; an editor also points aria-invalid and
    // aria-describedby at it. message is a message the caller has for an editor (a value the editor refused).
    editShowMessage(field, message) {
      const state = this.edit, entry = state.changes.get(field.record.id);
      const text = message || (entry && !Object.hasOwn(entry.values, field.spec.id) ? null : entry && editErrors(entry)[field.spec.id]) || null;
      editAttr(field.control, "aria-invalid", text ? "true" : null);
      editAttr(field.control, "aria-describedby", text ? state.tip.id : null);
      if (text) this.editTip(field.cell || field.host, text); else this.editHideMessage();
    },

    editRefreshMessage() {
      const state = this.edit, active = document.activeElement, session = state.session;
      const field = session && [...session.fields.values()].find(item => item.host.contains(active));
      if (field) { this.editShowMessage(field); return; }
      const cell = active?.classList?.contains("cx-cell") && this.canvas.contains(active) ? active : null, row = cell?.parentNode._w;
      const column = row && this.visibleColumns()[this.rowCells(cell.parentNode).indexOf(cell)], entry = row && state.changes.get(row.key);
      const text = entry && column ? editErrors(entry)[column.id] || (column === this.visibleColumns()[0] ? entry.error || entry.rowError : null) : null;
      if (text) this.editTip(cell, text); else this.editHideMessage();
    },

    editTip(anchor, text) {
      const tip = this.edit.tip, box = anchor.getBoundingClientRect();
      if (!anchor.isConnected || !box.width) { this.editHideMessage(); return; }
      setText(tip, text);
      tip.style.left = Math.max(4, Math.min(box.left, innerWidth - 280)) + "px"; tip.style.top = box.bottom + 4 + "px";
      if (!tip.matches(":popover-open")) tip.showPopover();
    },

    editHideMessage() { const tip = this.edit?.tip; if (tip?.matches(":popover-open")) tip.hidePopover(); },

    // Announces through the grid's live region; the same words twice still speak.
    editAnnounce(text) { if (text) setText(this.live, text + ((this.edit.flip = !this.edit.flip) ? " " : "")); },

    syncEditBar() {
      const state = this.edit;
      if (!state) return;
      // Hidden notes of messages that are gone go first, with or without an edit bar.
      for (const [key, note] of state.messages) {
        const row = key[0] === "\u0001", [id, column] = (row ? key.slice(1) : key).split("\u0000"), entry = state.changes.get(id);
        if (key !== "edited" && !(entry && (row ? entry.error || entry.rowError : editErrors(entry)[column]))) { note.remove(); state.messages.delete(key); }
      }
      if (!state.barEl) return;
      const entries = this.editEntries(), count = entries.length, errors = entries.filter(editInvalid).length, saving = [...state.changes.values()].some(entry => entry.status === "saving");
      state.barEl.hidden = !count && !state.undo.length && !state.redo.length && !saving;
      setText(state.barText, saving ? state.labels.gridEditSaving : fill(state.labels.gridEditChanges, { count: numberFormat(this.lang).format(count) }));
      setText(state.barErrors, errors && !saving ? " · " + fill(state.labels.gridEditErrors, { count: numberFormat(this.lang).format(errors) }) : "");
      state.undoButton.disabled = !state.undo.length; state.redoButton.disabled = !state.redo.length;
      state.discardButton.disabled = state.saveButton.disabled = !count || saving;
    },
    // Remembers the labels of lookup values the reader picked, so their cells show the label.
    editRemember(column, option) {
      const seen = (this.edit.seen ||= new Map()), list = seen.get(column) || [];
      if (!list.some(item => item.value === option.value)) { list.push(option); if (list.length > 1000) list.shift(); }
      seen.set(column, list);
    },

    async editLookup(spec, search, record, signal) {
      const limit = spec.lookup.limit, own = this.edit.options.lookups?.[spec.id], text = foldText(search.trim());
      const matching = list => list.filter(option => foldText(option.label).includes(text)).slice(0, limit);
      if (typeof own === "function") return editOptions(await own({ column: spec.id, search, limit, row: editCopy(record), signal }), spec.id).slice(0, limit);
      if (spec.options) return matching(spec.options);
      const column = this.columns.find(item => item.id === spec.lookup.column);
      if (this.view.source.kind === "inline") {
        const values = new Map();
        for (const row of this.view.rows) {
          const value = cellValue(row.cells[column.id]);
          if (value != null && !values.has(value)) values.set(value, { value, label: cellText(row.cells[column.id], column, this.fmt) });
        }
        return matching([...values.values()].sort((left, right) => left.label.localeCompare(right.label, this.lang)));
      }
      if (typeof this.source.facet !== "function" || !this.acceptedQuery) return [];
      const query = gridQuery(this.view, { ...this.acceptedQuery, search: "", filters: [], filterGroup: undefined });
      const page = await this.runGridHook(hook => this.source.facet(editCopy({ protocol: PROTOCOL, type: "gridFacetQuery", query, column: column.id,
        search, limit, includeCurrentFilter: false }), { signal: hook }), signal);
      checkDocument(page, "gridFacetPage");
      if (!Array.isArray(page.items)) throw new Error("CanopyX: malformed lookup values.");
      return page.items.filter(item => item && item.value != null).slice(0, limit).map(item => ({ value: item.value, label: cellText(item.value, column, this.fmt) }));
    }
  });

  const EDIT_FILL_ROW = DataGrid.prototype.fillRow;
  DataGrid.prototype.fillRow = function (element, row) {
    EDIT_FILL_ROW.call(this, element, row);
    if (this.edit && !row.status) this.paintEdits(element, row);
  };
