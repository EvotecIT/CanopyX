  // ---------- flat-grid focus and selection; no tree navigation ----------
  Object.assign(DataGrid.prototype, {
    setFocus(row, focus) {
      this.pendingNavigation = null;
      if (!row || this.indexOf(row) < 0 || this.destroyed) return;
      this.focused = row;
      const top = this.rowTop(row._ri), viewport = this.grid.clientHeight - this.head.offsetHeight;
      if (top < this.logicalTop()) this.setLogicalTop(top);
      else if (top + this.rowH > this.logicalTop() + viewport) this.setLogicalTop(top + this.rowH - viewport);
      this.render();
      if (focus) { const element = this.rendered.get(row); if (element) element.focus({ preventScroll: true }); }
    },

    onClick(event) {
      const element = event.target.closest(".cx-row"), row = element && element._w;
      if (!row || event.defaultPrevented || event.target.closest("a,button,input,select,textarea,[contenteditable]")) return;
      this.setFocus(row, true);
      if (row.status) { if (row.status === "error") this.retry().catch(() => {}); return; }
      if (this.view.selection === "none") return;
      const next = this.multi && (event.ctrlKey || event.metaKey) ? new Set(this.selected) : new Set();
      if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
      this.setSelection([...next]);
    },

    onKey(event) {
      const element = event.target.closest(".cx-row"), row = element && element._w;
      if (!row || event.defaultPrevented || event.isComposing || event.altKey) return;
      const cells = this.rowCells(element), navigation = this.pendingNavigation;
      const pendingPage = navigation && navigation.focus && navigation.epoch === this.queryEpoch && this.pendingQuery &&
        this.pendingPageNavigation && this.pendingPageNavigation.epoch === this.queryEpoch && this.focused === row;
      let column = cells.findIndex(cell => cell.contains(event.target));
      if (pendingPage || row.status && navigation && navigation.epoch === this.queryEpoch && navigation.index === row._ri && navigation.focus)
        column = this.visibleColumns().findIndex(item => item.id === navigation.columnId);
      const columnCount = row.status && column >= 0 ? this.visibleColumns().length : cells.length;
      const cell = column >= 0 ? cells[column] : null, control = cell && event.target !== cell ? event.target : null;
      if (!control && !row.status && (event.ctrlKey || event.metaKey)) {
        if (event.key.toLowerCase() === "c" && !(global.getSelection() || "").toString()) {
          event.preventDefault(); Promise.resolve().then(() => this.copyFocused(row, cell)).catch(error => this.emit("error", { error: error })); return;
        }
        if (event.key === "Enter" && typeof this.opts.onDetails === "function") {
          event.preventDefault(); Promise.resolve().then(() => this.openDetails(row.key)).catch(error => this.emit("error", { error: error })); return;
        }
      }
      const controls = cell ? cellControls(cell) : [];
      if (control && control.matches(OWN_ARROWS)) {
        if (event.key !== "Escape") return;
        this.focusCell(row, column, null); cell._cxAt = controls.indexOf(control);
        event.preventDefault(); event.stopPropagation(); return;
      }
      const at = control ? controls.indexOf(control) : cell && cell._cxAt >= 0 && cell._cxAt < controls.length ? cell._cxAt : -1;
      let index = pendingPage ? navigation.index : row._ri, nextColumn = column, nextControl = null;
      switch (event.key) {
        case "ArrowUp": index--; break;
        case "ArrowDown": index++; break;
        case "PageUp": index -= Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
        case "PageDown": index += Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
        case "Home": if (event.ctrlKey || event.metaKey) index = 0; else nextColumn = 0; break;
        case "End": if (event.ctrlKey || event.metaKey) index = this.rowCount() - 1; else nextColumn = columnCount - 1; break;
        case "ArrowLeft":
          if (at > 0) nextControl = at - 1;
          else if (column > 0) { nextColumn--; nextControl = -1; }
          else { this.setFocus(row, true); event.preventDefault(); return; }
          break;
        case "ArrowRight":
          if (at >= 0 && at < controls.length - 1) nextControl = at + 1;
          else nextColumn = Math.min(columnCount - 1, column + 1);
          break;
        case "Escape": this.setFocus(row, true); event.preventDefault(); return;
        case "F2":
          if (column >= 0) { this.setFocus(row, true); event.preventDefault(); return; }
          // Row focus enters its first cell, as Enter does.
        case "Enter":
          if (row.status) { if (row.status === "error") this.retry().catch(() => {}); }
          else if (!control) this.focusCell(row, Math.max(0, column), Math.max(0, at), true);
          else return;
          event.preventDefault(); return;
        case " ":
          if (control || row.status || this.view.selection === "none") return;
          { const next = this.multi ? new Set(this.selected) : new Set();
            if (next.has(row.key)) next.delete(row.key); else next.add(row.key); this.setSelection([...next]); }
          event.preventDefault(); return;
        default: return;
      }
      index = Math.max(0, Math.min(this.rowCount() - 1, index));
      this.focusResult(index, true, nextColumn, nextControl).catch(error => { if (error.name !== "AbortError") this.emit("error", { error: error }); });
      event.preventDefault(); event.stopPropagation();
    }
  });
