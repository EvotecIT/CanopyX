  // ---------- optional editor and shared interaction panels ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    actions: "Actions", editValue: "Edit {column}", saveEdit: "Save", cancelEdit: "Cancel", invalidEdit: "Enter a valid {column} value.",
    interactionPending: "Waiting for the host…", interactionRejected: "The host declined the operation.",
    interactionFailed: "Operation failed: {error}", markMove: "Move this node", moveHere: "Move here",
    moveBefore: "Move before", moveAfter: "Move after", cancelMove: "Cancel move"
  }));

  TreeGrid = class extends TreeGrid {
    build() {
      super.build();
      this.interactionUiLifetime = new AbortController();
      const signal = this.interactionUiLifetime.signal;
      this.grid.addEventListener("scroll", () => this.closeInteractionPanel(false), { signal, passive: true });
      global.addEventListener("resize", () => this.closeInteractionPanel(), { signal });
      document.addEventListener("pointerdown", event => {
        if (this.interactionPanel && !this.interactionPanel.contains(event.target)) this.closeInteractionPanel(false);
      }, { signal });
      this.grid.addEventListener("contextmenu", event => {
        const row = event.target.closest(".cx-row");
        if (row && row._w && !hostControl(event.target) && this.openActionMenu(row._w, row)) event.preventDefault();
      }, { signal });
    }

    interactionApi() {
      return Object.assign(super.interactionApi(), {
        beginEdit: (id, column) => this.beginEdit(id, column),
        openActions: id => { const w = this.interactionNode(id); return !!w && this.openActionMenu(w, this.rendered.get(w)); }
      });
    }

    openInteractionPanel(w, anchor, role, label) {
      const revision = (this.uiWorkRevision || 0) + (this.interactionPanel ? 1 : 0);
      this.closeInteractionPanel(false);
      if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision) return null;
      this.render();
      anchor = this.rendered.get(w);
      if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision || !anchor || !anchor.isConnected) return null;
      const panel = this.interactionPanel = h("div", "cx-interaction-panel");
      panel.setAttribute("role", role); panel.setAttribute("aria-label", label);
      this.panelNode = w;
      this.host.appendChild(panel);
      return panel;
    }

    placeInteractionPanel(anchor) {
      const panel = this.interactionPanel;
      if (!panel) return;
      const rect = anchor.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      panel.style.left = Math.max(8, Math.min(rect.left, global.innerWidth - bounds.width - 8)) + "px";
      const below = global.innerHeight - rect.bottom - 8, above = rect.top - 8;
      const top = below >= Math.min(bounds.height, 120) || below >= above ? rect.bottom : rect.top - bounds.height;
      panel.style.top = Math.max(8, Math.min(top, global.innerHeight - bounds.height - 8)) + "px";
    }

    closeInteractionPanel(restoreFocus = true) {
      const panel = this.interactionPanel, controller = this.editorController, w = this.panelNode;
      if (!panel) return null;
      const owned = panel.contains(document.activeElement);
      if (controller && this.uiPendingOperation && this.uiPendingOperation.controller === controller) {
        this.uiPendingOperation = null;
        setText(this.live, "");
      }
      this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
      const focus = owned ? { node: w, revision: this.uiWorkRevision } : null;
      this.interactionPanel = null; this.panelNode = null; this.editorController = null;
      panel.remove();
      this.abortInteractionController(controller);
      if (restoreFocus) this.restoreInteractionFocus(focus);
      return focus;
    }

    restoreInteractionFocus(focus) {
      if (!focus || this.destroyed || this.interactionClosing || this.interactionPanel || focus.revision !== this.uiWorkRevision) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement && active.isConnected) return;
      const visible = w => w && !w._invalidated && this.keyMap.get(w.key) === w && this.indexOf(w) >= 0;
      const target = visible(focus.node) ? focus.node : visible(this.focused) ? this.focused : this.rows.find(visible);
      if (target) this.setFocus(target, true);
      else { this.grid.tabIndex = 0; this.grid.focus({ preventScroll: true }); }
    }

    async performInteraction(work, controller = null) {
      this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
      const operation = this.uiPendingOperation = { controller };
      setText(this.live, this.labels.interactionPending);
      try {
        const accepted = await work();
        if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, accepted ? "" : this.labels.interactionRejected);
        return accepted;
      } catch (error) {
        if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, fill(this.labels.interactionFailed, { error: error && error.message || String(error) }));
        return false;
      } finally {
        if (this.uiPendingOperation === operation) this.uiPendingOperation = null;
      }
    }

    beginEdit(id, columnId) {
      if (this.destroyed || this.interactionClosing || this.initializing || this.restoring || !this.opts.onEdit) return false;
      const w = this.interactionNode(id), index = this.columns.findIndex(column => column.id === columnId), column = this.columns[index];
      if (!w || !column || !column.editable || column.hidden || !this.eligible("canEdit", w.h, column)) return false;
      const row = this.rendered.get(w);
      if (!row || !row.isConnected) return false;
      const label = fill(this.labels.editValue, { column: column.title });
      const panel = this.openInteractionPanel(w, row, "dialog", label);
      if (!panel) return false;
      const controller = this.editorController = new AbortController();
      const raw = this.cellOf(w.h, column, index), value = isCellObject(raw) ? raw.value : raw;
      const input = h("input", "cx-editor");
      input.type = column.kind === "number" || typeof value === "number" ? "number" : typeof value === "boolean" ? "checkbox" : "text";
      if (input.type === "number") { input.step = "any"; input.required = true; }
      input.checked = value === true;
      input.value = value == null ? "" : String(value); input.setAttribute("aria-label", label);
      const controls = h("div", "cx-interaction-buttons");
      const save = h("button"), cancel = h("button"); save.type = cancel.type = "button";
      setText(save, this.labels.saveEdit); setText(cancel, this.labels.cancelEdit);
      const title = h("div", "cx-interaction-title"); setText(title, label);
      controls.append(save, cancel); panel.append(title, input, controls);
      const submit = async () => {
        if (save.disabled) return;
        let next = input.type === "checkbox" ? input.checked : input.value;
        if (input.type === "number") {
          if (!input.value.trim() || !Number.isFinite(Number(input.value))) {
            input.setCustomValidity(fill(this.labels.invalidEdit, { column: column.title })); input.reportValidity(); return;
          }
          next = Number(input.value);
        }
        input.setCustomValidity(""); input.disabled = save.disabled = true;
        cancel.focus();
        const accepted = await this.performInteraction(() => this.requestEdit(id, columnId, next, { signal: controller.signal, reason: "editor" }), controller);
        if (this.interactionPanel !== panel) return;
        if (accepted) this.closeInteractionPanel();
        else { input.disabled = save.disabled = false; input.focus(); }
      };
      save.addEventListener("click", submit);
      cancel.addEventListener("click", () => this.closeInteractionPanel());
      panel.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.closeInteractionPanel(); }
        else if (event.key === "Enter" && event.target === input) { event.preventDefault(); submit(); }
      });
      this.placeInteractionPanel(row); input.focus(); if (input.type !== "checkbox") input.select();
      return true;
    }

    onKey(event) {
      if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target)) {
        const row = event.target.closest(".cx-row"), w = row && row._w;
        if (w && !w.status && !w.h.detail) {
          if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) {
            if (this.openActionMenu(w, row)) { event.preventDefault(); event.stopPropagation(); return; }
          }
          if (event.key === "Enter" && event.altKey) {
            const cell = event.target.closest(".cx-cell"), column = cell && cell.getAttribute("data-cx-column");
            const editable = this.columns.find(item => item.editable && !item.hidden && this.eligible("canEdit", w.h, item));
            if (this.beginEdit(w.key, column || editable && editable.id)) { event.preventDefault(); event.stopPropagation(); return; }
          }
        }
      }
      super.onKey(event);
    }

    destroy() {
      this.interactionClosing = true;
      this.closeInteractionPanel(false);
      if (this.interactionUiLifetime) this.interactionUiLifetime.abort();
      super.destroy();
      this.interactionUiLifetime = null;
    }
  };
