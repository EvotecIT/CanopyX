  // ---------- matrix: one tab stop and the grid keyboard (docs/matrix.md#keyboard) ----------
  // Focus is a row and a column: row -1 is the header, the row after the last is the totals row; column -1 holds the row
  // headers and the column after the last the row totals. Arrows move (mirrored right to left), Home and End go to the row's
  // ends (with Ctrl, the matrix's), Page Up and Page Down move by a viewport, Enter opens a cell or toggles a group.
  Object.assign(MatrixView.prototype, {
    captureFocus() {
      return MATRIX_AXES.map((axis, index) => {
        const entries = this.model[axis] || [], at = index ? this.focus.column : this.focus.row, entry = entries[at];
        return { at, end: entries.length > 0 && at === entries.length, id: entry?.kind === "item" ? entry.item.id : null,
          group: entry?.group ? { attribute: this.model.query?.group[axis], key: entry.group.key } : null };
      });
    },
    restoreFocus(anchor) {
      MATRIX_AXES.forEach((axis, index) => {
        const entries = this.model[axis], saved = anchor[index];
        const found = saved.id !== null ? entries.findIndex(entry => entry.kind === "item" && entry.item.id === saved.id) :
          saved.group && saved.group.attribute === this.query.group[axis] ? entries.findIndex(entry => entry.group?.key === saved.group.key) : -1;
        // If an entity disappears, stay at the nearest surviving position; keep header and total focus on their edges.
        this.focus[index ? "column" : "row"] = saved.end ? entries.length : found >= 0 ? found : Math.max(-1, Math.min(saved.at, entries.length - 1));
      });
    },
    focusElement(r, c) {
      const model = this.model, last = model.columns.length;
      if (r === -1) return c === -1 ? this.corner : c === last ? this.headTotal : this.headMounted.get(c) || null;
      if (r === model.rows.length) return c === -1 ? this.footHeader : c === last ? this.footGrand : this.footMounted.get(c) || null;
      const entry = model.rows[r], row = entry && this.rowsMounted.get(entry.key);
      if (!row) return null;
      if (c === -1 || entry.kind === "heading") return row._head;
      return c === last ? row._total : this.placeFocusCell(r, c);
    },
    syncTabStop() {
      const element = this.focusElement(this.focus.row, this.focus.column);
      if (this.focusCellElement && element !== this.focusCellElement && this.focusCellElement !== document.activeElement) this.focusCellElement.remove();
      if (this.tabStop && this.tabStop !== element) this.tabStop.tabIndex = -1;
      if (element) { element.tabIndex = 0; this.tabStop = element; }
    },
    bounds() {
      const model = this.model;
      return { top: -1, bottom: model.rows.length - (this.footH ? 0 : 1), left: -1, right: model.columns.length - (this.totalW ? 0 : 1) };
    },
    moveTo(r, c, focus = true, tip = true, reveal = true) {
      const b = this.bounds();
      r = Math.max(b.top, Math.min(b.bottom, r)); c = Math.max(b.left, Math.min(b.right, c));
      if (r === -1 && c === -1 && !focus) c = 0;
      this.focus = { row: r, column: c };
      if (reveal) this.ensureVisible(r, c);
      this.render();
      const element = this.focusElement(r, c);
      if (element && focus) { element.focus({ preventScroll: true }); if (tip && element.classList.contains("cx-mx-cell")) this.showTip(element, true); else this.hideTip(); }
    },
    ensureVisible(r, c) {
      const scroll = this.scroll, rtl = this.rtl;
      if (r >= 0 && r < this.model.rows.length) {
        const top = this.rowWindow.offset(r), view = scroll.clientHeight - this.headH - this.bandH - this.footH;
        if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + this.rowH > scroll.scrollTop + view) scroll.scrollTop = top + this.rowH - view;
      }
      if (c >= 0 && c < this.model.columns.length) {
        const left = this.columnWindow.offset(c), view = scroll.clientWidth - this.rowHeadW - this.totalW;
        let at = Math.abs(scroll.scrollLeft);
        if (left < at) at = left; else if (left + this.cellW > at + view) at = left + this.cellW - view;
        scroll.scrollLeft = rtl ? -at : at;
      }
    },
    onKey(event) {
      if (event.defaultPrevented || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target.closest && target.closest("input,select,textarea") || target.tagName === "BUTTON" && target !== this.tabStop && !target.closest(".cx-mx-rowhead,.cx-mx-hcell")) return;
      const { row, column } = this.focus, rtl = this.rtl, page = Math.max(1, Math.floor((this.scroll.clientHeight - this.headH - this.bandH - this.footH) / this.rowH) - 1);
      const b = this.bounds(), ctrl = event.ctrlKey;
      let next = null;
      switch (event.key) {
        case "ArrowUp": next = [row - 1, column]; break;
        case "ArrowDown": next = [row + 1, column]; break;
        case "ArrowLeft": next = [row, column + (rtl ? 1 : -1)]; break;
        case "ArrowRight": next = [row, column + (rtl ? -1 : 1)]; break;
        case "Home": next = ctrl ? [Math.max(0, b.top), b.left] : [row, b.left]; break;
        case "End": next = ctrl ? [b.bottom, b.right] : [row, b.right]; break;
        case "PageUp": next = [row - page, column]; break;
        case "PageDown": next = [row + page, column]; break;
        case "Enter": case " ": this.activate(this.focusElement(row, column)); event.preventDefault(); return;
        case "Escape": if (!this.tip.hidden) { this.hideTip(); event.preventDefault(); } return;
        default: return;
      }
      event.preventDefault();
      this.moveTo(next[0], next[1]);
    },
    onFocus(event) {
      const element = event.target.closest && event.target.closest(".cx-mx-cell,.cx-mx-rowhead,.cx-mx-hcell,.cx-mx-total,.cx-mx-fcell,.cx-mx-corner");
      if (!element || element._r === undefined && element !== this.corner) return;
      const r = element === this.corner ? -1 : element._r;
      // A group heading has only its row header: focus there keeps the column it came from, so arrows keep their column.
      const heading = this.model.rows[r]?.kind === "heading", c = element === this.corner ? -1 : heading ? this.focus.column : element._c;
      if (r !== this.focus.row || c !== this.focus.column) { this.focus = { row: r, column: c }; this.syncTabStop(); }
    },
    onClick(event) {
      const toggle = event.target.closest(".cx-mx-toggle");
      if (toggle && toggle._group) { this.toggleGroup(toggle._group.axis, toggle._group.key); return; }
      if (event.target.closest("a")) return;
      const target = this.cellAt(event);
      if (target) { this.focus = { row: target._r, column: target._c }; this.render(); const cell = this.focusElement(target._r, target._c); cell?.focus({ preventScroll: true }); this.openCell(cell || target); }
    },
    activate(element) {
      if (!element) return;
      const toggle = element.querySelector(".cx-mx-toggle");
      if (toggle && toggle._group) { this.toggleGroup(toggle._group.axis, toggle._group.key); return; }
      const link = element.querySelector("a[href]");
      if (link) { link.click(); return; }
      if (element.classList.contains("cx-mx-cell")) { this.openCell(element); return; }
      // A column header of a grouped column rolls its group up.
      const entry = element.classList.contains("cx-mx-hcell") && this.model.columns[element._c];
      if (entry && entry.band) this.toggleGroup("columns", entry.band.key);
    },
    toggleGroup(axis, key) {
      const list = this.query.collapsed[axis], at = list.indexOf(key);
      if (at >= 0) list.splice(at, 1); else list.push(key);
      const entryKey = "g" + key;
      this.derive(true);
      const index = (axis === "rows" ? this.model.rows : this.model.columns).findIndex(entry => entry.key === entryKey || entry.band && entry.band.key === key);
      if (index >= 0) this.moveTo(axis === "rows" ? index : this.focus.row, axis === "rows" ? -1 : index);
      this.stateChanged();
    }
  });
