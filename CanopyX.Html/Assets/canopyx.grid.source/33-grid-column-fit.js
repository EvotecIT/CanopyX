  // ---------- column sizing: measure content, give way by priority, fill the width ----------
  // A column's need is its header and a bounded sample of formatted values. Spare width goes to flex columns, then
  // the identity column up to the cap, then it is shared with the widest normal text column. A shortfall first takes
  // slack from normal and optional columns, then hides optional columns, and only then scrolls with pinned columns.
  const FIT = {};
  for (const name of ["applyWidths", "newCell", "setColumnWidth", "startResize", "buildHeader", "visibleColumns"]) FIT[name] = DataGrid.prototype[name];
  function gridPriority(value) {
    return ["essential", "normal", "optional"].includes(value) || Number.isInteger(value) && value >= 0 && value <= MAX_PROTOCOL_INTEGER;
  }
  // Numeric priorities follow DataTables' responsivePriority: 0-1 essential, 10000 and above optional, normal between.
  function gridRank(column) {
    const value = column.priority;
    return typeof value === "number" ? value : value === "optional" ? 10000 : value === "essential" || value === undefined && column.identity ? 0 : 5000;
  }
  function gridLevel(column) { const rank = gridRank(column); return rank < 2 ? 0 : rank < 10000 ? 1 : 2; }
  function gridOptions(grid, column) { return column.presenter || grid.view.reporting?.presenters?.[column.id] || {}; }
  // Text columns drawn as graphics keep their measured width and never take spare width.
  function gridTextual(grid, column) {
    return column.kind === "text" && !["statusStrip", "sparklineBars", "sparklineLine", "boolean", "progress"].includes(gridOptions(grid, column).kind);
  }
  // Normalizes declared sizing, priority and pins before state preparation (64-grid-column-pins wraps prepareState).
  function gridFitPrepare(grid) {
    const identity = grid.columns.find(column => column.rowHeader) || grid.columns[0];
    for (const column of grid.columns) {
      const policy = grid.columnLayouts?.get(column.id) || {};
      column.identity = column === identity; column.pref = column.autoWidth ? 0 : column.width; column.basePriority = column.priority; column.declared = column.width;
      column.minW = column.minWidth ?? policy.minimum ?? 40; column.maxW = column.maxWidth ?? policy.maximum ?? MAX_COLUMN_WIDTH;
      column.flexWeight = typeof column.flex === "number" ? column.flex : policy.flex || 0;
      if (column.flexWeight) column.flex = true; else if (typeof column.flex === "number") delete column.flex;
      column.pin ??= column.pinned === undefined ? column.identity ? "left" : "none" : column.pinned || "none";
    }
    grid.columns = ["left", "none", "right"].flatMap(side => grid.columns.filter(column => column.pin === side));
  }

  Object.assign(DataGrid.prototype, {
    visibleColumns() { return FIT.visibleColumns.call(this).filter(column => !column.fitHidden); },
    newCell(index, width, kind) { return FIT.newCell.call(this, index, kind ? this.cols[index].renderWidth ?? width : width, kind); },
    // Hiding is decided before the header reads its columns; a later change rebuilds once, after this build.
    buildHeader() {
      this.fitLayout(); this.fitBuilding = true;
      try { FIT.buildHeader.call(this); } finally { this.fitBuilding = false; }
      this.headCells.forEach((cell, index) => cell.querySelector(".cx-resize").addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) this.fitManual(this.cols[index]);
      }, true));
    },
    startResize(event, column) {
      if (!this.destroyed && !event.button) {
        this.fitManual(column);
        global.addEventListener("pointerup", () => this.emit("columnResize", { column: column.id, width: column.width }), { once: true, signal: this.lifetime.signal });
      }
      return FIT.startResize.call(this, event, column);
    },
    setColumnWidth(id, width) {
      const column = this.columns.find(item => item.id === id);
      if (column && Number.isFinite(width)) column.sized = true;
      FIT.setColumnWidth.call(this, id, width); this.emit("columnResize", { column: id, width: column.width });
    },
    applyWidths() {
      this.fitLayout();
      const visible = this.visibleColumns(), cols = this.cols, width = this.grid.clientWidth;
      if (cols && (visible.length !== cols.length || visible.some((column, index) => column !== cols[index]))) {
        if (!this.fitBuilding) { this.buildHeader(); this.syncColumnControls(); this.render(); return; }
        queueMicrotask(() => this.destroyed || this.applyWidths());
      }
      // A shortfall first takes the preferred width above content (so long values keep their measured width before
      // short columns keep their declared one), then content slack down to the floors.
      let total = 0, target;
      for (const column of cols) total += column.renderWidth = this.fitSize(column);
      for (const level of [2, 1]) if (width && total > width) {
        let slack = 0;
        for (const column of cols) slack += column.renderWidth - this.fitSize(column, level);
        const share = Math.min(1, (total - width) / slack || 0); total = 0;
        for (const column of cols) total += column.renderWidth -= (column.renderWidth - this.fitSize(column, level)) * share;
      }
      if (width && total < width) target = this.fitSpare(cols.filter(column => !column.fixed && !column.sized), width - total);
      total = 0;
      for (const column of cols) total += column.renderWidth = Math.floor(column.renderWidth);
      if (target && width > total) target.renderWidth += width - total;
      FIT.applyWidths.call(this, cols.map(column => column.renderWidth));
    },
    fitManual(column) { column.width = column.renderWidth ?? column.width; column.sized = true; },
    // The base width (content or preferred), the content width (level 2), or the narrowest width before hiding
    // (level 1): essential columns keep their content width.
    fitSize(column, level) {
      const need = column.need ?? column.width;
      return Math.round(Math.min(column.maxW, Math.max(column.minW, column.fixed || column.sized ? column.width : !level ? Math.max(need, column.pref) : level > 1 || !gridLevel(column) ? need :
        Math.min(need, Math.max(column.headNeed || 0, gridTextual(this, column) ? this.fitCh || 88 : 0)))));
    },
    fitSpare(columns, spare) {
      let target, flex = columns.filter(column => column.flex && column.flexWeight);
      const grow = (column, limit) => {
        const add = column ? Math.min(spare, Math.min(limit, column.maxW) - column.renderWidth) : 0;
        if (add > 0) { column.renderWidth += add; spare -= add; target = column; }
      };
      for (let before = 0; spare > 0.5 && flex.length && before !== spare;) {
        const weight = flex.reduce((sum, column) => sum + column.flexWeight, 0); before = spare;
        for (const column of flex) grow(column, column.renderWidth + before * column.flexWeight / weight);
        flex = flex.filter(column => column.maxW - column.renderWidth > 0.5);
      }
      const identity = columns.find(column => column.identity), widest = columns.filter(column => !column.identity &&
        gridTextual(this, column) && gridLevel(column) === 1).sort((a, b) => b.need - a.need)[0];
      grow(identity, 420);
      if (identity && widest) grow(widest, widest.renderWidth + spare * widest.need / (widest.need + identity.need));
      grow(identity, Infinity); grow(widest, Infinity);
      return target;
    },
    // Hides optional columns (and normal ones on phones) until the floors fit. Essential, pinned and sized columns stay.
    fitLayout() {
      const width = this.grid.clientWidth, phone = this.host.clientWidth <= 640, shown = FIT.visibleColumns.call(this).filter(column => !column.responsiveHidden);
      if (!width) return;
      const key = this.pendingQuery ? this.fitKey : this.queryEpoch + ":" + phone;
      if (key !== this.fitKey || !this.fitCh) {
        this.fitKey = key; this.fitFont = null;
        for (const column of this.columns) { const result = this.measureGridColumn(column); column.need = result.width; column.headNeed = result.head; }
      }
      // Base widths depend on content, not on the available width, so responsive policies read stable values.
      for (const column of this.columns) if (!column.fixed && !column.sized) column.width = this.fitSize(column);
      let total = 0;
      for (const column of this.columns) column.fitHidden = false;
      for (const column of shown) total += this.fitSize(column, 1);
      for (const column of shown.filter(column => column.pin === "none" && !column.sized && !this.columnLayouts?.get(column.id)?.alwaysVisible &&
          gridLevel(column) > !phone).sort((a, b) => gridLevel(b) - gridLevel(a) || gridRank(b) - gridRank(a) || shown.indexOf(b) - shown.indexOf(a)))
        if (total > width) { column.fitHidden = true; total -= this.fitSize(column, 1); }
    },
    measureGridColumn(column) {
      const context = this.fitContext ||= document.createElement("canvas").getContext("2d"), query = this.acceptedQuery;
      if (!context) throw new Error("CanopyX: no canvas context.");
      if (!this.fitFont) {
        const style = getComputedStyle(this.grid), head = this.headCells?.[0] && getComputedStyle(this.headCells[0]), family = " " + style.fontFamily;
        this.fitFont = [style.fontWeight + " " + style.fontSize + family, "700 12.5px" + family, (head ? head.fontWeight + " " + head.fontSize : "700 13px") + family,
          parseFloat(getComputedStyle(this.host).getPropertyValue("--cx-cell-px")) || 12];
        context.font = this.fitFont[0]; this.fitCh = Math.ceil(context.measureText("00000000000").width);
      }
      const [, small, headFont, pad] = this.fitFont, first = column === FIT.visibleColumns.call(this)[0], options = gridOptions(this, column), kind = options.kind;
      const text = (value, font = this.fitFont[0]) => { context.font = font; return context.measureText(String(value).slice(0, 512)).width; };
      const head = Math.ceil(text(column.title, headFont) + 2 * pad + (this.host.clientWidth <= 640 ? 52 : 32) + (this.view.reporting?.columnReorder ? 24 : 0) +
        (query?.sort.some(sort => sort.column === column.id) ? 22 : 0) + (gridColumnFiltered(query, column.id) ? 24 : 0) + (first && this.selectionControls ? 26 : 0));
      let values = 0, sampled = 0;
      // Presenter-aware estimates of rendered values, without touching the DOM.
      // Wrapping and complete-text columns keep a declared width: they show more lines or a "show more" control instead.
      const none = column.autoSize === "none" || column.pref && (column.wrap || ["longText", "tags", "list"].includes(kind));
      if (!none && column.autoSize !== "header") for (const row of this.rowCache.values()) {
        if (sampled === 200) break;
        const cell = row.h.cells[column.id], value = cellText(cell, column, this.fmt) || "—", series = gridSeries(cell).length;
        const quiet = options.quietTones?.includes(gridPresenterTone(options, cellValue(cell), isCellObject(cell) && cell.tone));
        values = Math.max(values, kind === "statusStrip" ? Math.min(series, 12) * 7 : kind === "sparklineBars" ? Math.min(series, 12) * 6 : kind === "sparklineLine" ? 80 : kind === "boolean" ? 16 :
          Math.min(kind === "longText" || kind === "tags" || kind === "list" || column.wrap ? 320 : 420, text(value, kind === "enum" && !quiet ? small : undefined)) +
          (kind === "progress" ? 80 : kind === "enum" && !quiet ? 18 : kind === "state" && !quiet ? 15 : kind === "tags" || kind === "list" ? 48 : 0)); sampled++;
      }
      // A row checkbox takes its 16 px box, its 6 px margin and the cell's 6 px gap before the value, in every density.
      const cap = Math.min(column.maxW, Math.max(column.minW, 420));
      const need = none ? column.pref || column.width : Math.min(cap, Math.max(head,
        Math.ceil(values + (sampled ? 2 * pad + 4 + (first && this.view.reporting?.selectionControls ? 28 : 0) : 0))));
      return Object.freeze({ width: Math.max(column.minW, need), head: Math.min(head, cap), sampled, scope: "loaded" });
    },
    autoFitColumn(id) {
      const column = this.columns.find(item => item.id === id);
      if (!column || this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.hasGridSize()) throw new Error("CanopyX: auto-fit is unavailable.");
      this.fitFont = null; const result = this.measureGridColumn(column); this.setColumnWidth(id, result.width); return result;
    },
    autoFitColumns() { return Object.freeze(Object.fromEntries(this.columns.map(column => [column.id, this.autoFitColumn(column.id)]))); },
    /** Returns columns to automatic content sizing: user widths are dropped and the layout fills the width again. */
    autoSizeColumns(ids = this.columns.map(column => column.id)) {
      if (!Array.isArray(ids) || ids.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: name declared columns.");
      for (const column of this.columns) if (ids.includes(column.id)) { column.sized = false; if (column.flexWeight) column.flex = true; }
      this.fitKey = null; this.applyWidths(); this.stateChanged();
    },
    setColumnPriority(id, priority) {
      const column = this.columns.find(item => item.id === id);
      if (!column || !gridPriority(priority)) throw new Error("CanopyX: invalid column priority.");
      column.priority = priority; this.applyWidths(); this.syncColumnControls(); this.stateChanged();
    },
    pinColumn(id, side) { return this.setColumnPinned(id, side || "none"); }
  });
  const FIT_STATE_COLUMN = gridStateColumn, FIT_STATE_COLUMNS = gridStateColumns;
  // Saved views keep user and fixed widths; automatic columns save their declared width, so snapshots do not churn with data.
  gridStateColumn = column => Object.assign(FIT_STATE_COLUMN(column), { width: column.sized || column.fixed ? column.width : column.declared ?? column.width }, column.sized && { sized: true }, column.priority !== undefined && { priority: column.priority });
  gridStateColumns = (grid, input) => {
    const result = FIT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column?.id, column]));
    for (const saved of result) {
      const { sized = sources.get(saved.id)?.flex === false || undefined, priority } = sources.get(saved.id) || saved;
      if (sized !== undefined && typeof sized !== "boolean" || priority !== undefined && !gridPriority(priority)) throw new Error("CanopyX: invalid saved column.");
      Object.assign(saved, sized && { sized }, priority !== undefined && { priority });
    }
    return result;
  };
