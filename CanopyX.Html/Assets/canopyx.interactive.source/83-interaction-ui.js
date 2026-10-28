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
    }

    buildToolbar() {
      super.buildToolbar();
      if (!(this.opts.onEdit && this.columns.some(column => column.editable) ||
        this.opts.onAction && this.view.contextActions?.length || this.view.dragDrop && this.opts.onDrop)) return;
      const signal = this.interactionUiLifetime.signal;
      this.actionMenuReady = loadPart(SHARED_PARTS["ui-menu"]).then(() => {
        if (!signal.aborted) UI_IMPL.treeActions.start.call(this, hostControl);
      });
      this.toolsReady = Promise.all([this.toolsReady, this.actionMenuReady]).catch(error => {
        if (!signal.aborted) this.emit("error", { error });
      });
    }

    interactionApi() {
      return Object.assign(super.interactionApi(), {
        beginEdit: (id, column) => this.beginEdit(id, column),
        openActions: id => { const w = this.interactionNode(id); return !!w && this.openActionMenu(w, this.rendered.get(w)); }
      });
    }

    openInteractionPanel(w, anchor, role, label) {
      return UI_IMPL.treeActions.openInteractionPanel.call(this, w, anchor, role, label);
    }

    closeInteractionPanel(restoreFocus = true) {
      return UI_IMPL.treeActions?.closeInteractionPanel.call(this, restoreFocus) || null;
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

    onKey(event) {
      if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target)) {
        const row = event.target.closest(".cx-row"), w = row && row._w;
        if (w && !w.status && !w.h.detail) {
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
