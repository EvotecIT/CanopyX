  // ---------- tree grid: focus ownership across status-row page requests ----------
  Object.assign(TreeGrid.prototype, {
    async loadStatusPage(parent, status, cursor) {
      const previous = new Set(parent.children || []);
      const element = document.activeElement;
      const revision = this.focusRevision || 0;
      const owned = this.focused === status && element && element._w === status;
      if (owned) this.focusHandoff = status;
      try { await this.loadPage(parent, cursor); }
      finally {
        if (this.focusHandoff === status) this.focusHandoff = null;
        if (!this.destroyed) {
          // The new rows are where focus goes, even while an opening path holds back the rest of the grid.
          if (owned) this.flushLayout();
          if (owned && (this.focusRevision || 0) === revision &&
              (document.activeElement === element || document.activeElement === document.body)) {
            let target = parent.error ? this.statusRow(parent, "error") :
              (parent.children || []).find((child) => !previous.has(child)) ||
              (parent.next ? this.statusRow(parent, "more") : parent !== this.root ? parent : this.rows[0]);
            while (target && this.indexOf(target) < 0) target = target.parent;
            target = target || this.rows[0];
            if (target) this.setFocus(target, true);
            else {
              this.focused = null;
              this.grid.tabIndex = 0;
              this.render();
              this.grid.focus({ preventScroll: true });
            }
          }
          // Also retire removed status rows when another control took focus during the request.
          this.relayout();
        }
      }
    }
  });
