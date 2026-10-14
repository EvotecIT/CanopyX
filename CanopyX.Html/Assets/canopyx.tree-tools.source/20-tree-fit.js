  // ---------- tree tools: content-sized columns with the flat grid's fit routines ----------
  // A tree column's need is its header and the formatted values of the visible rows; the tree column adds each row's
  // indent, expander, icon, checkbox and badges, so its need is the width of its deepest, longest visible row. The shared
  // routines (COLUMN_FIT) then fill the width: the tree column is the identity column and takes spare width, priorities hide
  // optional columns first, and the tree column stays pinned while the other columns scroll. Columns are measured again
  // when the visible rows change (expanding, collapsing, filtering, sorting), at most once per frame, never while scrolling.
  const TREE_FIT = {};
  for (const name of ["applyWidths", "visibleColumns", "setColumnWidth", "startResize", "buildHeader", "render", "getState", "readState", "applyStatePresentation"])
    TREE_FIT[name] = TreeGrid.prototype[name];
  // Up to this many visible rows are measured; deeper trees keep the widths of the rows above.
  const TREE_FIT_ROWS = 2000;

  Object.assign(TreeGrid.prototype, COLUMN_FIT, {
    // The layout fields flat-grid validation checks; only the tree column may unpin (pinned: null) or pin left.
    checkTreeLayout() {
      for (const [index, column] of this.view.columns.entries()) {
        if (column.priority !== undefined && !gridPriority(column.priority) || column.flex !== undefined && !(typeof column.flex === "number" && column.flex >= 0 && column.flex <= 100) ||
            [column.fixed, column.alwaysVisible, column.autoWidth].some(value => value !== undefined && typeof value !== "boolean") ||
            column.autoSize !== undefined && !["content", "header", "none"].includes(column.autoSize) ||
            column.pinned !== undefined && (index || column.pinned !== null && column.pinned !== "left")) throw new Error("CanopyX: invalid tree column layout.");
      }
    },

    startFit() {
      const identity = this.columns[0];
      for (const column of this.columns) {
        // A column the view sizes by content (no width, or autoWidth) measures it; a declared width is preferred.
        const declared = this.view.columns.find(item => item.id === column.id);
        column.autoWidth = !!(declared.autoWidth || declared.width === undefined);
        gridFitColumn(column, identity);
        // A state restored before this part installed keeps its widths as the reader's.
        column.declared = columnWidth(column, declared.width ?? 160);
        if (this.restoredPin && column.width !== column.declared) column.sized = true;
        column.pin = column === identity ? "left" : "none";
      }
      // The tree column pins left unless the view unpins it (pinned: null) or the state chose otherwise.
      if (identity.pinned !== null && !this.restoredPin) this.host.classList.add("cx-pin-tree");
      this.fitReady = true; this.fitRows = null;
      this.observeFit();
      this.buildHeader();
    },

    // The container's width decides hiding and spare width; its height decides nothing here (see auto height).
    observeFit() {
      let width = 0;
      const observer = new ResizeObserver(() => requestAnimationFrame(() => {
        if (this.destroyed || !this.grid.clientWidth || this.grid.clientWidth === width) return;
        width = this.grid.clientWidth; this.syncPhone(); this.applyWidths();
        // The toolbar can wrap differently at the new width: let auto height measure again on the next render.
        this.heightTotal = undefined; this.scheduleRender();
      }));
      observer.observe(this.grid);
      this.lifetime.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    },

    visibleColumns() { return TREE_FIT.visibleColumns.call(this).filter(column => !column.fitHidden); },

    // Hiding is decided before the header reads its columns. A keyboard resize starts from the width on screen.
    buildHeader() {
      if (this.fitReady) this.fitLayout();
      TREE_FIT.buildHeader.call(this);
      if (this.fitReady) this.headCells.forEach((cell, index) => cell.querySelector(".cx-resize").addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) this.fitManual(this.cols[index]);
      }, true));
    },

    applyWidths(widths) {
      if (widths || !this.fitReady || !this.cols) return TREE_FIT.applyWidths.call(this, widths);
      const width = this.grid.clientWidth;
      this.fitLayout();
      const visible = this.visibleColumns();
      if (visible.length !== this.cols.length || visible.some((column, index) => column !== this.cols[index])) {
        this.buildHeader(); this.syncColumnControls(); this.version++; this.scheduleRender(); return;
      }
      TREE_FIT.applyWidths.call(this, this.fitWidths(this.cols, width));
    },

    // A width the reader drags, types or sets stays (sized) until Reset columns.
    startResize(event, column) {
      if (!this.destroyed && !event.button && this.fitReady) this.fitManual(column);
      return TREE_FIT.startResize.call(this, event, column);
    },
    setColumnWidth(id, width) {
      const column = this.columns.find(item => item.id === id);
      if (column && Number.isFinite(width)) column.sized = true;
      return TREE_FIT.setColumnWidth.call(this, id, width);
    },

    // Measures when the visible rows or the shown columns changed, then hides what does not fit.
    fitLayout() {
      const width = this.grid.clientWidth;
      if (!width) return;
      const key = this.layout + ":" + this.local + ":" + (this.host.clientWidth <= 640);
      if (this.fitRows !== this.rows || this.fitKey !== key) {
        this.fitRows = this.rows; this.fitKey = key; this.measureTreeColumns();
      }
      this.fitHide(TREE_FIT.visibleColumns.call(this), width, this.host.clientWidth <= 640);
    },

    measureTreeColumns() {
      const context = this.fitContext ||= document.createElement("canvas").getContext("2d");
      if (!context) return;
      const style = getComputedStyle(this.grid), family = " " + style.fontFamily, head = this.headCells?.[0] && getComputedStyle(this.headCells[0]);
      const font = style.fontWeight + " " + style.fontSize + family, headFont = (head ? head.fontWeight + " " + head.fontSize : "700 13px") + family;
      const badgeFont = "400 " + parseFloat(style.fontSize) * 0.8 + "px" + family, pad = parseFloat(getComputedStyle(this.host).getPropertyValue("--cx-cell-px")) || 8;
      const text = (value, using = font) => { context.font = using; return context.measureText(String(value).slice(0, 512)).width; };
      const badges = list => (list || []).reduce((sum, badge) => sum + text(badge.text, badgeFont) + 20, 0);
      this.fitCh = Math.ceil(text("00000000000"));
      const rows = [];
      for (const w of this.rows) { if (rows.length === TREE_FIT_ROWS) break; if (!w.status && !w.h.detail) rows.push(w); }
      // A checkbox (interactive runtime) and an icon sit between the expander and the label.
      const check = this.checkMode ? 22 : 0;
      this.columns.forEach((column, index) => {
        const headNeed = Math.ceil(text(column.title, headFont) + 2 * pad + (column.sortable ? 22 : 8));
        let values = 0;
        if (column.autoSize !== "none" && column.autoSize !== "header") for (const w of rows) {
          const cell = this.cellOf(w.h, column, index), object = isCellObject(cell);
          let need = text(cellText(cell, column, this.fmt)) + badges(index === 0 ? w.h.badges : null) + badges(object ? cell.badges : null);
          // The indent, the 18-pixel expander and the cell's two 2-pixel gaps; an icon is 16 pixels with 4 of margin and a gap.
          if (index === 0) need += (w.level - 1) * INDENT + 22 + check + (w.h.icon && this.iconTemplates.has(w.h.icon) ? 22 : 0);
          if (need > values) values = need;
        }
        // The tree column is measured whole (its maximum width bounds it); other columns stop at 420 pixels.
        const cap = index === 0 ? column.maxW : columnWidth(column, 420);
        column.headNeed = Math.min(headNeed, cap);
        column.need = Math.max(column.minW, column.autoSize === "none" ? column.pref || column.width : Math.min(cap, Math.max(headNeed, Math.ceil(values + 2 * pad + 2))));
      });
    },

    // The visible rows changed: measure and fit again on the next frame, and recompute the height (30-tree-height).
    render() {
      const measured = TREE_FIT.render.call(this);
      if (this.fitReady && this.fitRows !== this.rows && !this.fitPending) {
        this.fitPending = true;
        requestAnimationFrame(() => { this.fitPending = false; if (!this.destroyed && this.fitRows !== this.rows) this.applyWidths(); });
      }
      this.watchHeight();
      return measured;
    },

    // Saved views and remembered state keep the order and each column's width: the reader's width (sized) or the declared
    // or restored one, which fitting treats as preferred; the width on screen is not saved, so snapshots do not churn.
    getState() {
      const state = TREE_FIT.getState.call(this);
      state.columns.forEach((saved, index) => { if (this.columns[index].sized) saved.sized = true; });
      return state;
    },
    readState(state) {
      const result = TREE_FIT.readState.call(this, state);
      if (result && result.columns) result.columns.forEach((column, index) => { if (state.columns[index].sized === true) column.sized = true; });
      return result;
    },
    applyStatePresentation(state) {
      if (state.version && state.columns) {
        // The tree column stays first; the others take the saved order, and columns the state does not name go last.
        const order = state.columns.map(column => column.id), rank = column => { const at = order.indexOf(column.id); return at < 0 ? order.length : at; };
        this.columns = [this.columns[0], ...this.columns.slice(1).sort((a, b) => rank(a) - rank(b))];
        // A width a host restores without sized is the reader's width when it differs from the declared one.
        for (const saved of state.columns) { const column = this.columns.find(item => item.id === saved.id); if (column) column.sized = !!saved.sized || column.declared !== undefined && saved.width !== column.declared; }
        this.restoredPin = true;
      }
      return TREE_FIT.applyStatePresentation.call(this, state);
    }
  });
