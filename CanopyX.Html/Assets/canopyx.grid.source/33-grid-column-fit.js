  // ---------- flat-grid column sizing: measure content, then fit with the shared routines (33-column-fit-core.js) ----------
  // A column's need is its header and a bounded sample of formatted values.
  const FIT = {};
  for (const name of ["applyWidths", "newCell", "setColumnWidth", "startResize", "buildHeader", "visibleColumns"]) FIT[name] = DataGrid.prototype[name];
  // Normalizes declared sizing, priority and pins before state preparation (64-grid-column-pins wraps prepareState).
  function gridFitPrepare(grid) {
    const identity = grid.columns.find(column => column.rowHeader) || grid.columns[0];
    for (const column of grid.columns) {
      gridFitColumn(column, identity);
      column.pin ??= column.pinned === undefined ? column.identity ? "left" : "none" : column.pinned || "none";
    }
    grid.columns = ["left", "none", "right"].flatMap(side => grid.columns.filter(column => column.pin === side));
  }

  Object.assign(DataGrid.prototype, COLUMN_FIT, {
    fitAvailableWidth() {
      const grid = this.grid;
      if (!grid.clientWidth) return 0;
      // Observer content widths retain fractions and already exclude padding, borders and scrollbar gutters.
      // Before first delivery, leave one pixel for clientWidth's rounding; the observer then fills the real space.
      const style = this.fitContentWidth === undefined && getComputedStyle(grid);
      const width = style ? grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1 : this.fitContentWidth;
      return Math.max(0, Math.floor(width));
    },
    // Optional visibility uses the same content floors as fitting, before remaining columns scroll.
    fitHide(shown, width, phone) {
      COLUMN_FIT.fitHide.call(this, shown, width, phone);
      if (!phone || (this.layoutMode || "fit") !== "fit") return;
      const identity = shown.find(column => column.identity);
      // If the reader hid the declared identity, preserve the shared fitter's last visible column and its scrolling floor.
      if (!identity) return;
      // Normal context belongs below the identity; authored always-visible and reader sizing stay authoritative.
      for (const column of shown) if (!column.identity && gridLevel(column) > 0 && !column.alwaysVisible && !column.fixed && !column.sized) column.fitHidden = true;
      const peers = shown.filter(column => !column.fitHidden && !column.identity && gridLevel(column) === 0);
      if (identity.fixed || identity.sized) return;
      const primary = columnWidth(identity, Math.min(Math.max(identity.contentNeed || 0, identity.pref || 0, identity.headWrapNeed || 0), Math.max(160, width * .65)));
      if (primary + peers.reduce((sum, column) => sum + this.fitSize(column, 2), 0) > width)
        for (const column of peers) if (!column.fixed && !column.sized && !column.alwaysVisible) column.fitHidden = true;
    },
    // Readable header/content minima precede preferred reading space. Explicit fixed/reader widths remain authoritative.
    fitSize(column, level) {
      if (column.fixed || column.sized) return columnWidth(column, column.width);
      const need = column.need ?? column.width, content = column.autoSize === "header" ? need : column.contentNeed ?? need;
      const header = column.headWrapNeed || 0;
      const floor = Math.max(level === undefined ? need : content, header);
      let width = Math.max(floor, level === undefined ? column.pref || 0 : 0);
      if (column === this.desktopDisclosureColumn) width += this.desktopDisclosureWidth;
      if (column.identity && this.host.clientWidth <= 640 && (this.layoutMode || "fit") === "fit") {
        // The identity keeps forty percent before peers move to the context line; small values need no empty allocation.
        const available = this.fitAvailableWidth(), minimum = Math.min(content, available * .4);
        width = Math.max(header, minimum, Math.min(width, Math.max(minimum, available * .5)));
      }
      return Math.ceil(columnWidth(column, width));
    },
    fitShrink(cols, excess) {
      // Preferred whitespace yields before content; a caption never yields below two complete lines.
      const slack = cols.map(column => Math.max(0, column.renderWidth - this.fitSize(column, 1)));
      const total = slack.reduce((sum, width) => sum + width, 0), ratio = total ? Math.min(1, excess / total) : 0;
      cols.forEach((column, index) => column.renderWidth -= slack[index] * ratio);
      return Math.max(0, excess - total);
    },
    fitSpare(columns, spare) {
      // Authored flex weights win; otherwise measured content shares surplus without favouring the identity.
      const flex = columns.filter(column => column.flexWeight);
      const first = gridFitGrow(flex, spare, column => column.flexWeight);
      return gridFitGrow(columns.filter(gridTextual), first.spare, column => column.contentNeed || column.need).target || first.target;
    },
    visibleColumns() { return FIT.visibleColumns.call(this).filter(column => !column.fitHidden); },
    newCell(index, width, kind) { return FIT.newCell.call(this, index, kind ? this.cols[index].renderWidth ?? width : width, kind); },
    // Hiding is decided before the header reads its columns; a later change rebuilds once, after this build.
    buildHeader() {
      this.fitLayout(); this.fitBuilding = true;
      try { FIT.buildHeader.call(this); } finally { this.fitBuilding = false; }
      this.headCells.forEach((cell, index) => {
        cell.querySelector(".cx-sort,.cx-htext").title = cell.title;
        cell.querySelector(".cx-resize").addEventListener("keydown", event => {
          if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) this.fitManual(this.cols[index]);
        }, true);
      });
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
      if (this.phone !== undefined) this.updateGridPhone();
      const visible = this.visibleColumns(), cols = this.cols, width = this.fitAvailableWidth();
      if (cols && (visible.length !== cols.length || visible.some((column, index) => column !== cols[index]))) {
        if (!this.fitBuilding) { this.buildHeader(); this.syncColumnControls(); this.render(); return; }
        queueMicrotask(() => this.destroyed || this.applyWidths());
      }
      FIT.applyWidths.call(this, this.fitWidths(cols, width));
      if (this.headRow.matches(":hover")) this.syncColumnMenuRoom?.();
      // A column resize can introduce a classic horizontal scrollbar without changing the observed border box.
      this.fitHeight();
    },
    // Measures once per query and phone layout, then hides what does not fit (fitHide).
    fitLayout() {
      const width = this.fitAvailableWidth(), phone = this.host.clientWidth <= 640, shown = FIT.visibleColumns.call(this).filter(column => !column.responsiveHidden);
      if (!width) return;
      const compact = !phone && shown.some(c => gridLevel(c) > 1);
      this.host.classList.toggle("cx-narrow", compact);
      const key = this.pendingQuery ? this.fitKey : this.queryEpoch + ":" + phone + compact;
      if (key !== this.fitKey || !this.fitCh) {
        this.fitKey = key; this.fitFont = null;
        for (const column of this.columns) column.need = this.measureGridColumn(column).width;
      }
      this.desktopDisclosureColumn = null;
      // Base widths depend on content, not on the available width, so responsive policies read stable values.
      for (const column of this.columns) { if (!column.fixed && !column.sized) column.width = this.fitSize(column); }
      this.fitHide(shown, width, phone);
      const hidden = this.columns.filter(column => !column.hidden && (column.fitHidden || column.responsiveHidden));
      this.desktopHiddenFields = !phone && hidden.length > 0;
      if (this.desktopHiddenFields) {
        this.desktopDisclosureColumn = shown.find(column => !column.fitHidden);
        this.fitContext.font = this.fitFont[0];
        const label = fill(plural(this.labels.hiddenColumns, hidden.length, this.lang), { count: numberFormat(this.lang).format(hidden.length) });
        this.desktopDisclosureWidth = Math.ceil(this.fitContext.measureText(label).width) + 12;
      }
      // Residual disclosure belongs to the context line and takes no width from the identity.
    },
    measureGridColumn(column) {
      const context = this.fitContext ||= document.createElement("canvas").getContext("2d"), query = this.acceptedQuery;
      if (!context) throw new Error("CanopyX: no canvas context.");
      if (!this.fitFont) {
        const style = getComputedStyle(this.grid), head = this.headCells?.[0] && getComputedStyle(this.headCells[0]), family = " " + style.fontFamily;
        // The formatting extension also reads the base/cue/header/padding positions in this array.
        this.fitFont = [style.fontWeight + " " + style.fontSize + family, "700 12.5px" + family, (head ? head.fontWeight + " " + head.fontSize : "700 13px") + family,
          parseFloat(head?.paddingRight) || 12];
        // Monospace identifiers and their secondary text are drawn in their own fonts, so they are measured in them.
        this.fitFont.push(gridClassFont(this.grid, "p-mono"), gridClassFont(this.grid, "p-sub"), gridClassFont(this.grid, "p-pill", this.fitPill = {}), gridClassFont(this.grid, "cx-sort-priority"));
        this.fitNumericVariant = gridNumericVariant(this.grid);
        context.font = this.fitFont[0]; this.fitCh = Math.ceil(gridMeasureText(context, "00000000000", this.fitNumericVariant));
      }
      const [, , headFont, pad, mono, sub, pillFont, priorityFont] = this.fitFont, first = column === FIT.visibleColumns.call(this)[0], options = gridOptions(column), kind = options.kind;
      const text = (value, font = this.fitFont[0], numeric = true) => { context.font = font; return gridMeasureText(context, value, numeric ? this.fitNumericVariant : "normal"); };
      // Reorder glyphs keep their native advance and padding. Column menus overlay the title and cost no fit width.
      const move = this.view.reporting?.columnReorder ? Math.max(32, Math.ceil(text("⋮⋮", headFont, false)) + 8) : 0, target = this.host.clientWidth <= 640 ? 44 : 24;
      const sort = query?.sort.findIndex(sort => sort.column === column.id) ?? -1;
      const chrome = 2 * pad + 8 + move + (sort < 0 ? 0 : 22 + (query.sort.length > 1 ? text(sort + 1, priorityFont, false) + 4 : 0)) +
        (gridColumnFiltered(query, column.id) ? target : 0) + (first && this.selectionControls ? target + 2 : 0);
      const title = text(column.title, headFont, false), head = Math.ceil(Math.max(24, title) + chrome);
      const words = column.title.trim().split(/\s+/);
      let balanced = title;
      for (let split = 1; split < words.length; split++) balanced = Math.min(balanced,
        Math.max(text(words.slice(0, split).join(" "), headFont, false), text(words.slice(split).join(" "), headFont, false)));
      column.headWrapNeed = Math.ceil(Math.max(24, balanced) + chrome);
      // Neither the caption nor body measurements reserve space for the overlaid menu.
      let values = 0, sampled = 0;
      // Presenter-aware estimates of rendered values, without touching the DOM.
      // Wrapping and complete-text columns keep a declared width: they show more lines or a "show more" control instead.
      const none = column.autoSize === "none" || column.pref && (column.wrap || ["longText", "tags", "list"].includes(kind));
      if (!none && column.autoSize !== "header") for (const row of this.rowCache.values()) {
        if (sampled === 200) break;
        const cell = row.h.cells[column.id], value = cellText(cell, column, this.fmt) || "—", series = gridSeries(cell).length;
        const change = options.beforeAfter && isCellObject(cell) && cell.changes?.[0];
        if (change) {
          const spec = { ...column, kind: change.kind || column.kind };
          values = Math.max(values, Math.min(420, text(changeCellText(change.before, spec, this.fmt)) + text("→") +
            text(changeCellText(change.after, spec, this.fmt)) + 12)); sampled++; continue;
        }
        const tone = columnValueTone(column, cell) || gridPresenterTone(options, cellValue(cell), isCellObject(cell) && cell.tone), quiet = options.quietTones?.includes(tone);
        const secondary = kind === "identifier" && (options.secondaryColumn ? cellText(row.h.cells[options.secondaryColumn], this.columns.find(item => item.id === options.secondaryColumn), this.fmt) : isCellObject(cell) && cell.secondary);
        const atomic = kind === "enum" || kind === "state";
        // All enum tones use the same pill font and chrome; state presenters retain dots.
        const pill = kind === "enum" && !quiet;
        const atomicWidth = atomic ? text(value, pill ? pillFont : undefined) +
          (pill ? this.fitPill.extra + this.fitPill.spacing * Array.from(value).length : quiet && kind === "enum" ? 16 : quiet ? 0 : kind === "state" && tone !== "success" ? 15 : 13) : 0;
        values = Math.max(values, atomic ? atomicWidth : kind === "identifier" ? Math.min(420, text(value, options.mono ? mono : undefined, !options.mono) + (secondary ? 6 + text(secondary, sub) : 0)) : kind === "statusStrip" ? Math.min(series, 12) * 7 : kind === "sparklineBars" ? Math.min(series, 12) * 6 : kind === "sparklineLine" ? 80 : kind === "boolean" ? 16 :
          Math.min(kind === "longText" || kind === "tags" || kind === "list" || column.wrap ? 320 : 420, text(value)) +
          (kind === "progress" ? 80 : kind === "tags" || kind === "list" ? 48 : 0)); sampled++;
      }
      // A row checkbox takes its 16 px box, its 6 px margin and the cell's 6 px gap before the value, in every density.
      const cap = columnWidth(column, kind === "enum" || kind === "state" ? column.maxW : 420);
      // The values alone (without the header or aggregates): the floor of a date, number or graphic column.
      const measured = Math.min(cap, Math.ceil(values + (sampled ? 2 * pad + 4 + (first && this.selectionControls ? 28 : 0) : 0)));
      column.contentNeed = none || !sampled ? 0 : measured;
      const need = none ? column.pref || column.width : Math.min(cap, Math.max(column.headWrapNeed, measured));
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
    }
  });
  const FIT_STATE_COLUMN = gridStateColumn, FIT_STATE_COLUMNS = gridStateColumns;
  // Saved views keep user and fixed widths; automatic columns save their declared width, so snapshots do not churn with data.
  gridStateColumn = column => Object.assign(FIT_STATE_COLUMN(column), { width: column.sized || column.fixed ? column.width : column.declared }, column.sized && { sized: true }, column.priority !== undefined && { priority: column.priority });
  gridStateColumns = (grid, input) => {
    const result = FIT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column?.id, column]));
    for (const saved of result) {
      const { sized = sources.get(saved.id)?.flex === false || undefined, priority } = sources.get(saved.id) || saved;
      if (sized !== undefined && typeof sized !== "boolean" || priority !== undefined && !gridPriority(priority)) throw new Error("CanopyX: invalid saved column.");
      Object.assign(saved, sized && { sized }, priority !== undefined && { priority });
    }
    return result;
  };
