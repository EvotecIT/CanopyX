  // ---------- editing: the record drawer as an edit form ----------
  // On phones (editing.drawer "phone", the default; "always" on every width; "never" keeps it read-only) the record drawer
  // shows an editor for each editable field, with the same checks as the cells. Save applies the form as one undo step and
  // commits the row (rowCommit); a message stays beside each invalid field and a summary above the buttons. Moving to
  // another record in the drawer leaves the form's unsaved input behind.
  // The drawer (filter editor part, generalised by the record panel part) dispatches cx-drawer-paint after it paints a
  // record; the form follows those paints through the grid's drawer hooks and reads the record from dialog._cxRecord.
  const editDrawerOn = grid => { const state = grid.edit; return !!state && state.specs.size > 0 && state.drawer !== "never" && (state.drawer !== "phone" || grid.phone); };
  // First of the drawer hooks (order 10): formatting (20) and search highlighting (30) decorate the form's fields after it.
  DataGrid.drawerHook(10, function (dialog) {
    dialog.addEventListener("cx-drawer-paint", () => {
      const body = dialog.querySelector(".cx-drawer-body");
      if (body && dialog.isConnected && editDrawerOn(this)) this.editForm(dialog, body, dialog._cxRecord?.id);
    });
    // A drawer replaced by another (a related record) closes after the new one has built its form: dispose only its own.
    dialog.addEventListener("close", () => { if (this.edit?.form?.dialog === dialog) this.editFormDispose(); }, { once: true });
  });

  Object.assign(DataGrid.prototype, {
    editFormDispose() {
      const form = this.edit?.form;
      if (form) { form.fields.forEach(field => this.editDispose(field)); this.edit.form = null; }
    },

    // A field the record panel would hide as empty stays visible while it can be edited in the form.
    recordKeepField(id, record) {
      return editDrawerOn(this) && !this.editReadOnly && this.edit.specs.has(id) && !!record && !!this.editRecord(record.id) && this.canEditCell(this.editRecord(record.id), id);
    },

    // Turns the drawer's editable fields into editors, in the order the drawer lists them (drawerFields: the plain drawer's
    // sections, or the record panel's tabs and sections); record-only fields and structured blocks stay read-only. A repaint
    // of the same record (a tab, details that arrive, the empty-field switch) moves the editors it has into the new fields, so
    // the reader's unsaved input stays, also on tabs out of view; another record starts a new form.
    editForm(dialog, body, id) {
      const state = this.edit, record = this.editRecord(id), labels = state.labels;
      const kept = state.form && state.form.dialog === dialog && state.form.record.id === id && record ? state.form : null;
      if (!kept) this.editFormDispose();
      if (!record || this.editReadOnly || this.destroyed) { this.editFormDispose(); return; }
      const form = kept || (state.form = { dialog, record, fields: [] }), existing = new Map(form.fields.map(field => [field.spec.id, field]));
      for (const { column, term, value } of this.drawerFields(dialog)) {
        if (!column || value.tagName !== "DD" || !state.specs.has(column.id) || !this.canEditCell(record, column.id)) continue;
        let field = existing.get(column.id);
        if (!field) {
          field = this.editCreate(record, state.specs.get(column.id), "form");
          field.message = h("div", "cx-edit-message"); field.message.id = this.id + "-em" + ++state.sequence; field.message.hidden = true;
          form.fields.push(field);
        }
        field.label = term;
        // Hook-only refreshes reuse this field. Moving its existing editor would interrupt focus while the reader types.
        if (field.host.parentNode !== value || field.message.parentNode !== value) value.replaceChildren(field.host, field.message);
      }
      dialog.classList.toggle("cx-edit-form", form.fields.length > 0);
      let foot = dialog.querySelector(".cx-drawer-f");
      if (!form.fields.length) { foot?.remove(); return; }
      if (!foot) {
        foot = h("div", "cx-drawer-f");
        const summary = h("p", "cx-drawer-summary");
        summary.setAttribute("role", "alert"); summary.hidden = true;
        const cancel = gridButton(labels.gridEditCancel, () => dialog.close());
        const save = gridButton(labels.gridEditSave, () => this.editFormSave().catch(error => this.emit("error", { error })));
        save.classList.add("cx-edit-save");
        foot.append(summary, cancel, save);
        dialog.appendChild(foot);
        dialog.addEventListener("keydown", event => {
          if (event.key === "Enter" && !event.defaultPrevented && !event.isComposing && event.target.matches("input:not([type=checkbox])")) {
            event.preventDefault(); this.editFormSave().catch(error => this.emit("error", { error }));
          }
        });
      }
      form.summary = foot.querySelector(".cx-drawer-summary"); form.summary.hidden = true;
    },

    editFormMessage(field, message) {
      setText(field.message, message || ""); field.message.hidden = !message;
      editAttr(field.control, "aria-invalid", message ? "true" : null);
      editAttr(field.control, "aria-describedby", message ? field.message.id : null);
    },

    // Checks every field (asynchronous validators too), applies the form and commits the row.
    async editFormSave() {
      const form = this.edit.form, labels = this.edit.labels;
      if (!form || form.busy) return false;
      form.busy = true;
      try {
        const values = [], invalid = [];
        for (const field of form.fields) {
          const parse = field.instance.error?.() || null, value = parse ? undefined : field.instance.getValue();
          const message = parse || (!editScalar(value) ? fill(labels.gridEditChoice, { column: field.spec.column.title }) : null);
          if (message) { this.editFormMessage(field, message); invalid.push(field); }
          else values.push([field.spec, value, field]);
        }
        const preview = this.editPreview(form.record, values), shape = JSON.stringify(preview.cells);
        for (const item of values) {
          const field = item[2];
          let message = this.editRules(field.spec, item[1], preview);
          if (message && typeof message.then === "function") message = await message;
          this.editFormMessage(field, message);
          if (message) invalid.push(field);
          item[2] = { result: message, row: shape };
        }
        if (this.edit.form !== form) return false;
        if (!invalid.length) {
          this.editGroup(() => { for (const [spec, value, checked] of values) this.editApply(form.record.id, spec, value, "form", form.record, checked); });
          const result = await this.commitRow(form.record.id);
          if (this.edit.form !== form) return result.ok;
          if (result.ok) { form.dialog.close(); return true; }
          for (const field of form.fields) if (Object.hasOwn(result.errors || {}, field.spec.id) && result.errors[field.spec.id]) {
            this.editFormMessage(field, result.errors[field.spec.id]); invalid.push(field);
          }
          form.summary.hidden = false; setText(form.summary, result.error || fill(labels.gridEditErrors, { count: invalid.length || 1 }));
        } else { form.summary.hidden = false; setText(form.summary, fill(labels.gridEditErrors, { count: invalid.length })); }
        (invalid[0]?.control || form.summary).focus?.({ preventScroll: false });
        return false;
      } finally { form.busy = false; }
    }
  });
