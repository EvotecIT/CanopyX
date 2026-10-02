
  // ---------- tree grid: keyboard ----------
  // Row-focus model: Up/Down move, Right expands then enters, Left collapses then goes to the parent, Home/End,
  // PageUp/PageDown, Enter toggles and selects, Space selects (toggles with multi-select), Shift extends a multi-select,
  // printable keys run type-ahead on labels. Tab and Shift+Tab leave the grid, also from a cell. Right on a row that
  // cannot open further, and F2 on any row, move into the row's cells when one holds a control (see 62-cell-focus.js).
  function hostControl(target) {
    const row = target.closest(".cx-row");
    const control = target.closest("input,textarea,select,button,a,summary,[tabindex],[contenteditable]:not([contenteditable=false]),[role=button],[role=checkbox],[role=radio],[role=link],[role=textbox],[role=combobox],[role=menuitem],[role=separator]");
    // A cell or a detail body that cell navigation made focusable is not a control of the host's.
    return control && row && row !== control && row.contains(control) && !control.matches(".cx-cell,.cx-detail-body") ? control : null;
  }
  Object.assign(TreeGrid.prototype, {
    onKey(e) {
      if (e.defaultPrevented || e.isComposing) return;
      if (this.head.contains(e.target)) {
        return;
      }
      // Focus in a cell, on the cell or on a control in it: cell navigation, or the control's own keys.
      const rowEl = e.target.closest(".cx-row");
      if (rowEl && rowEl !== e.target && e.key === "Tab" && e.shiftKey && !e.defaultPrevented) {
        this.skipRowTabStop(rowEl);
        return;
      }
      if (rowEl && rowEl !== e.target && this.onCellKey(e)) {
        return;
      }
      const w = this.focused || this.rows[0];
      if (!w) {
        return;
      }
      const i = this.indexOf(w);
      const pageHeight = Math.max(this.rowH, this.grid.clientHeight - this.head.offsetHeight - this.rowH);
      const last = this.rows.length - 1;
      // A space inside a running type-ahead term continues the term ("lab c").
      const key = e.key === " " && this.typeBuf && performance.now() - this.typeAt <= TYPEAHEAD_MS ? "typeahead" : e.key;
      let target = null;
      let handled = true;
      switch (key) {
        case "ArrowDown": target = this.rows[Math.min(last, i + 1)]; break;
        case "ArrowUp": target = this.rows[Math.max(0, i - 1)]; break;
        case "PageDown": target = this.rows[Math.min(last, Math.max(i + 1, this.rowAt(this.tops[i] + pageHeight)))]; break;
        case "PageUp": target = this.rows[Math.max(0, Math.min(i - 1, this.rowAt(this.tops[i] - pageHeight)))]; break;
        case "Home": target = this.rows[0]; break;
        case "End": target = this.rows[last]; break;
        case "ArrowRight":
          if (!w.status && this.expandable(w) && !w._open) {
            this.toggle(w, true);
          } else if (!w.status && this.expandable(w) && this.rows[i + 1] && this.rows[i + 1].parent === w) {
            target = this.rows[i + 1];
          } else if (!w.status) {
            // Nothing to open or enter below: the row's cells, when one of them holds a control.
            this.enterCells(w);
          }
          break;
        case "F2":
          if (!w.status) this.enterCells(w);
          break;
        case "ArrowLeft":
          if (!w.status && w._open) {
            this.toggle(w, false);
          } else if (w.parent && w.parent !== this.root) {
            target = w.parent;
          }
          break;
        case "Enter":
        case " ":
          try { this.activate(w, key === "Enter"); }
          finally { e.preventDefault(); e.stopPropagation(); }
          return;
        default:
          handled = this.typeAhead(e, i);
      }
      if (target) {
        this.setFocus(target);
        if (!target.status && this.multi && e.shiftKey && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End)$/.test(key)) {
          this.selectRange(target);
        }
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    /** Enter or Space on a row: retry, show more, or select (and with Enter, toggle). */
    activate(w, enter) {
      if (w.status === "more") {
        this.loadMore(w.parent);
      } else if (w.status === "error") {
        this.retryPage(w);
      } else if (!w.status) {
        let accepted, revision;
        try {
          accepted = this.multi && !enter ? this.select(w, { toggle: true }) :
            this.select(w, { deferNotify: enter && this.expandable(w) });
          revision = this.selectionRevision;
        } finally {
          if (enter && this.expandable(w)) this.toggle(w);
        }
        if (accepted && enter && this.expandable(w) && revision === this.selectionRevision)
          this.notifySelection(w, Array.from(this.selected).map((selected) => selected.h), revision);
      }
    },

    async retryPage(status) {
      const parent = status.parent;
      await this.loadStatusPage(parent, status, parent.next || null);
    },

    typeAhead(e, i) {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        return false;
      }
      const now = performance.now();
      const letter = e.key.toLowerCase();
      this.typeBuf = now - this.typeAt > TYPEAHEAD_MS ? letter : this.typeBuf + letter;
      this.typeAt = now;
      const n = this.rows.length;
      const start = this.typeBuf.length === 1 ? i + 1 : i;
      for (let k = 0; k < n; k++) {
        const w = this.rows[(start + k) % n];
        if (!w.status && String(w.h.label).toLowerCase().startsWith(this.typeBuf)) {
          this.setFocus(w);
          break;
        }
      }
      return true;
    },

    announce(message) {
      setText(this.live, message);
    }
  });
