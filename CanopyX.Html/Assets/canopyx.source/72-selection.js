  // ---------- tree grid: selection and deep-link ownership ----------
  Object.assign(TreeGrid.prototype, {
    /** Selects a row. Options: toggle (Ctrl/Cmd or Space with multi-select), range (Shift). */
    select(w, options) {
      if (!w || w.status) {
        return;
      }
      const o = options || {};
      if (this.multi && o.range && this.anchor) {
        this.selectRange(w);
        return;
      }
      if (this.multi && o.toggle) {
        if (this.selected.has(w)) {
          this.selected.delete(w);
        } else {
          this.selected.add(w);
        }
      } else {
        this.selected = new Set([w]);
      }
      this.anchor = w;
      this.selectionChanged(w, !o.deferNotify);
    },

    selectRange(w) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        this.select(w);
        return;
      }
      this.selected = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (!this.rows[i].status) {
          this.selected.add(this.rows[i]);
        }
      }
      this.selectionChanged(w);
    },

    selectionChanged(w, notify = true) {
      for (const [node, row] of this.rendered) {
        if (!node.status) setAttr(row, "aria-selected", this.selected.has(node) ? "true" : "false");
      }
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop());
      if (notify) this.notifySelection(w, nodes);
    },

    notifySelection(w, nodes) {
      this.emit("select", { node: w.h, nodes: nodes });
      if (this.opts.onSelect) {
        this.opts.onSelect(w.h, nodes);
      }
    }
  });
