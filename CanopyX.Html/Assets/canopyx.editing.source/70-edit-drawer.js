  // ---------- editing: the record drawer as an edit form ----------
  // On phones (editing.drawer "phone", the default; "always" on every width; "never" keeps it read-only) the record drawer
  // shows an editor for each editable field, with the same checks as the cells. Save applies the form as one undo step and
  // commits the row (rowCommit); a message stays beside each invalid field and a summary above the buttons. Moving to
  // another record in the drawer leaves the form's unsaved input behind.
  const EDIT_OPEN_DRAWER = DataGrid.prototype.openGridDrawer;
  DataGrid.prototype.openGridDrawer = function (record, index, returnFocus) {
    EDIT_OPEN_DRAWER.call(this, record, index, returnFocus);
    const state = this.edit, dialog = this.recordDrawer, body = dialog?.querySelector(".cx-drawer-body");
    if (!state || !body || state.drawer === "never" || state.drawer === "phone" && !this.phone || !state.specs.size) return;
    this.editForm(dialog, body, record.id);
    // The drawer repaints for the record it moved to, or for the same record when moving failed: the title tells which.
    const primary = this.visibleColumns()[0], shown = () => {
      const row = this.focused, title = dialog.querySelector(".cx-drawer-h h4")?.textContent;
      return row && !row.status && (cellText(row.h.cells[primary.id], primary, this.fmt) || row.key) === title ? row.key : this.edit.form?.record.id ?? record.id;
    };
    const observer = new MutationObserver(() => this.editForm(dialog, body, shown()));
    observer.observe(body, { childList: true });
    dialog.addEventListener("close", () => { observer.disconnect(); this.editFormDispose(); }, { once: true });
  };

  Object.assign(DataGrid.prototype, {
    editFormDispose() {
      const form = this.edit?.form;
      if (form) { form.fields.forEach(field => this.editDispose(field)); this.edit.form = null; }
    },

    // Turns the drawer's fields into editors, in the order the drawer lists them (by section, then column order).
    editForm(dialog, body, id) {
      const state = this.edit, record = this.editRecord(id), labels = state.labels;
      this.editFormDispose();
      if (!record || this.editReadOnly || this.destroyed) return;
      const sections = new Map();
      for (const column of this.columns) {
        const name = column.section || this.labels.gridDetailsSection;
        if (!sections.has(name)) sections.set(name, []);
        sections.get(name).push(column);
      }
      const order = [...sections.values()].flat(), values = body.querySelectorAll(":scope > dl > dd");
      if (values.length !== order.length) return;
      const form = state.form = { dialog, record, fields: [] };
      order.forEach((column, index) => {
        if (!this.canEditCell(record, column.id)) return;
        const field = this.editCreate(record, state.specs.get(column.id), "form"), message = h("div", "cx-edit-message");
        message.id = this.id + "-em" + ++state.sequence; message.hidden = true;
        field.message = message; field.label = values[index].previousElementSibling;
        values[index].replaceChildren(field.host, message);
        form.fields.push(field);
      });
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
          let message = parse || this.editRules(field.spec, value, form.record, false);
          if (message && typeof message.then === "function") message = await message;
          this.editFormMessage(field, message);
          if (message) invalid.push(field); else values.push([field.spec, value]);
        }
        if (this.edit.form !== form) return false;
        if (!invalid.length) {
          this.editGroup(() => { for (const [spec, value] of values) this.editApply(form.record.id, spec, value, "form", form.record); });
          const result = await this.commitRow(form.record.id);
          if (this.edit.form !== form) return result.ok;
          if (result.ok) { form.dialog.close(); return true; }
          for (const field of form.fields) if (result.errors?.[field.spec.id]) { this.editFormMessage(field, result.errors[field.spec.id]); invalid.push(field); }
          form.summary.hidden = false; setText(form.summary, result.error || fill(labels.gridEditErrors, { count: invalid.length || 1 }));
        } else { form.summary.hidden = false; setText(form.summary, fill(labels.gridEditErrors, { count: invalid.length })); }
        (invalid[0]?.control || form.summary).focus?.({ preventScroll: false });
        return false;
      } finally { form.busy = false; }
    }
  });
