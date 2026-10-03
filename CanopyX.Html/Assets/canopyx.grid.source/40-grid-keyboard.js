  // ---------- flat-grid focus and selection; no tree navigation ----------
  Object.assign(DataGrid.prototype, {
    setFocus(row, focus) {
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
      const cells = this.rowCells(element), column = cells.findIndex(cell => cell.contains(event.target));
      const cell = column >= 0 ? cells[column] : null, control = cell && event.target !== cell ? event.target : null;
      if (control && control.matches(OWN_ARROWS) && event.key !== "Escape") return;
      let index = row._ri, nextColumn = column;
      switch (event.key) {
        case "ArrowUp": index--; break;
        case "ArrowDown": index++; break;
        case "PageUp": index -= Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
        case "PageDown": index += Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
        case "Home": if (event.ctrlKey || event.metaKey) index = 0; else nextColumn = 0; break;
        case "End": if (event.ctrlKey || event.metaKey) index = this.rowCount() - 1; else nextColumn = cells.length - 1; break;
        case "ArrowLeft": nextColumn = Math.max(0, column - 1); break;
        case "ArrowRight": nextColumn = Math.min(cells.length - 1, column + 1); break;
        case "Escape": this.setFocus(row, true); event.preventDefault(); return;
        case "Enter":
        case "F2":
          if (row.status) { if (row.status === "error") this.retry().catch(() => {}); }
          else if (!control) this.focusCell(row, Math.max(0, column), 0, true);
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
      const next = this.rowItem(index);
      if (nextColumn < 0 || !next || next.status) this.setFocus(next, true);
      else this.focusCell(next, nextColumn, null);
      event.preventDefault(); event.stopPropagation();
    }
  });
