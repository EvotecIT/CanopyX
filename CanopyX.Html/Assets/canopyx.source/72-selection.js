  // ---------- tree grid: selection and deep-link ownership ----------
  Object.assign(TreeGrid.prototype, {
    /** Selects a row. Options: toggle (Ctrl/Cmd or Space with multi-select), range (Shift). */
    select(w, options) {
      if (!w || w.status) {
        return;
      }
      const o = options || {};
      const previous = Array.from(this.selected);
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
      previous.forEach((p) => { p._v = 0; });
      w._v = 0;
      this.selectionChanged(w);
    },

    selectRange(w) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        this.select(w);
        return;
      }
      this.selected.forEach((p) => { p._v = 0; });
      this.selected = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (!this.rows[i].status) {
          this.selected.add(this.rows[i]);
          this.rows[i]._v = 0;
        }
      }
      this.selectionChanged(w);
    },

    selectionChanged(w) {
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop());
      this.emit("select", { node: w.h, nodes: nodes });
      if (this.opts.onSelect) {
        this.opts.onSelect(w.h, nodes);
      }
    }
  });
