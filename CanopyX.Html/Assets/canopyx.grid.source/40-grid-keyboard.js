  // ---------- flat-grid focus and selection; no tree navigation ----------
  Object.assign(DataGrid.prototype, {
    setFocus(row, focus) {
      this.pendingNavigation = null;
      if (!row || this.indexOf(row) < 0 || this.destroyed) return;
      if (focus) this.focusOrigin = null;
      this.focused = row;
      this.revealGridRow(row, row._ri);
      if (this.render()) { this.revealGridRow(row, row._ri); this.render(); }
      if (focus) {
        const element = this.rendered.get(row);
        if (this.hasGridSize() && element) element.focus({ preventScroll: true });
        else { this.focusOrigin = document.activeElement; this.scheduleRender(); }
      }
    },

    onClick(event) {
      const element = event.target.closest(".cx-row"), row = element && element._w, link = event.target.closest("a.p-link");
      // A link cell asks the host first (canopyx:link, onLink); cancelling keeps the browser from following it, so a host can
      // route the link itself. The row's own link action arrives here too, as a click on the link.
      if (row && link && !this.emit("link", { id: row.key, row: gridFreeze(JSON.parse(JSON.stringify(row.h))), href: link.href,
        column: this.visibleColumns()[this.rowCells(element).findIndex(cell => cell.contains(link))]?.id })) event.preventDefault();
      if (!row || event.defaultPrevented || event.target.closest("a,button,input,select,textarea,[contenteditable]")) return;
      this.setFocus(row, true);
      if (row.status) { if (row.status === "error") this.retry().catch(() => {}); return; }
      if (this.selectOnClick && this.view.selection !== "none") {
        if (event.detail < 2) this.selectClickedRow(row, event);
        return;
      }
      // By default a plain click runs the row's primary action.
      // The second click of a double click activates nothing more.
      const action = event.detail < 2 && this.clickAction(element);
      if (action) this.activateRow(row, false, action !== true && action, event);
    },
    selectClickedRow(row, event) {
      const additive = this.multi && (event.ctrlKey || event.metaKey);
      if (this.multi && event.shiftKey && this.selectionAnchor != null) {
        this.selectRowRange(this.selectionAnchor, row._ri, { additive }).catch(error => {
          if (error.name !== "AbortError") this.emit("error", { error });
        });
      } else {
        this.selectionController?.abort();
        const next = additive ? new Set(this.selected) : new Set();
        if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
        this.setSelection([...next]); this.selectionAnchor = row._ri;
      }
    },
    // What a plain click on the row does: follow its link, open details (true), or nothing; a double click activates otherwise.
    clickAction(element) {
      return this.view.rowAction === "link" && element.querySelector("a[href]") || this.phone || this.view.rowAction === "details";
    },

    // Activation (a double click, Enter on the row, Ctrl+Enter, or a click with a row action or on a phone) asks the host
    // first: the cancelable canopyx:rowActivate event and onRowActivate, returning false, keep the row's own action (the link,
    // or record details through onDetails or the drawer) from running, so a host can open its own view of the row.
    // The row's own action follows its link (with the click's modifier keys) or opens record details.
    activateRow(row, keyboard, link, event = {}) {
      if (this.emit("rowActivate", { id: row.key, row: gridFreeze(JSON.parse(JSON.stringify(row.h))), keyboard })) link ?
        link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey })) :
        Promise.resolve().then(() => this.openDetails(row.key)).catch(error => this.emit("error", { error }));
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
      // Enter on a link row follows its link, like a click; Ctrl/Command+Enter keeps opening record details.
      if(event.key==="Enter"&&!control&&!row.status&&column<0){event.preventDefault();this.activateRow(row,true,this.view.rowAction==="link"&&!event.ctrlKey&&!event.metaKey&&element.querySelector("a[href]"));return;}
      if (!control && !row.status && (event.ctrlKey || event.metaKey)) {
        if (event.key.toLowerCase() === "c" && !(global.getSelection() || "").toString()) {
          event.preventDefault(); Promise.resolve().then(() => this.copyFocused(row, cell)).catch(error => this.emit("error", { error })); return;
        }
        if (event.key === "Enter") {
          event.preventDefault(); this.activateRow(row, true); return;
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
        case "PageUp": index = this.gridPageStep({ ...row, _ri: index }, -1); break;
        case "PageDown": index = this.gridPageStep({ ...row, _ri: index }, 1); break;
        case "Home": if (event.ctrlKey || event.metaKey) index = this.cursor ? this.rowBounds().first : 0; else nextColumn = 0; break;
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
        case "Escape": this.gridPickKey(event, row, column); this.setFocus(row, true); event.preventDefault(); return;
        case "F2":
          if (this.gridPickKey(event, row, column)) return;
          if (column >= 0) { this.setFocus(row, true); event.preventDefault(); return; }
          // F2 enters the first cell from row focus.
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
      index = Math.max(this.cursor ? this.rowBounds().first : 0, Math.min(this.rowCount() - 1, index));
      this.focusResult(index, true, nextColumn, nextControl).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
      event.preventDefault(); event.stopPropagation();
    }
  });
