  // ---------- starting cell ranges on a grid, and the API ----------
  // A grid with rangeSelection listens for pointer, touch, keyboard and clipboard input on its body; its render passes repaint
  // the ranges. The API works on every grid once the part is in, with or without the pointer and keyboard input.
  function crCopyOptions(options) {
    if (!options || typeof options !== "object" || options.headers !== undefined && typeof options.headers !== "boolean" ||
        options.values !== undefined && !["display", "raw"].includes(options.values)) crBad("copy options are headers (boolean) and values (display or raw)");
  }
  function crAt(grid, row, column, name) {
    const bounds = crBounds(grid);
    if (!Number.isInteger(row) || row < bounds.first || row > bounds.last || !grid.cols.some(item => item.id === column)) crBad(name + " needs row positions in the result and visible columns");
    return { row, column };
  }

  Object.assign(DataGrid.prototype, {
    startCellRanges() {
      if (this.cellOptions || this.destroyed) return;
      const options = this.cellOptions = crOptions(this), signal = this.lifetime.signal, shared = Object.getPrototypeOf(this);
      this.cellRanges = []; this.cellAnchor = null;
      this.renderPass = function (...args) { const result = shared.renderPass.apply(this, args); crPaint(this); return result; };
      // Columns that leave the view take their ranges' corners with them; a new query clears the ranges.
      const columns = () => { const before = this.cellRanges.length; this.cellRanges = this.cellRanges.filter(range => crRect(this, range)); if (before !== this.cellRanges.length) crChanged(this); else crPaint(this); };
      // A reload of the same query at the same data revision (same search, filters, sorting and page) keeps the ranges: its
      // rows keep their places. A new revision, another query, or a reporting group that collapses or expands clears them.
      const shape = (query, revision) => query && JSON.stringify([query.search, query.searchMode, query.sort, query.filters, query.filterGroup, query.groupBy, this.paged ? query.offset : 0, revision]);
      const clear = () => { if (this.cellRanges.length) { this.cellRanges = []; this.cellAnchor = null; this.cellHandles = false; crChanged(this); } };
      let accepted = shape(this.getQuery(), this.snapshot?.revision);
      this.host.addEventListener("canopyx:query", event => {
        const next = shape(event.detail.query, event.detail.revision);
        if (next === accepted) return;
        accepted = next; clear();
      }, { signal });
      this.host.addEventListener("canopyx:group", clear, { signal });
      this.host.addEventListener("canopyx:detail", clear, { signal });
      this.host.addEventListener("canopyx:state", columns, { signal });
      document.addEventListener("copy", event => crCopyEvent(this, event), { signal });
      if (!options.enabled) return;
      this.host.classList.add("cx-cell-ranges");
      signal.addEventListener("abort", () => { this.host.classList.remove("cx-cell-ranges"); crGuard(this, false); }, { once: true });
      if (options.multiple) this.grid.setAttribute("aria-multiselectable", "true");
      this.canvas.addEventListener("pointerdown", event => {
        if (event.target.closest(".cx-fill-handle")) crFillDrag(this, event);
        else if (event.target.closest(".cx-range-handle")) crHandleDown(this, event);
        else crPointerDown(this, event);
      }, { signal });
      this.grid.addEventListener("keydown", event => crKey(this, event), { capture: true, signal });
      // After the grid's own click handling, a plain click puts focus in the clicked cell, so the keyboard continues there.
      this.grid.addEventListener("click", () => {
        const hit = this.cellFocusAfterClick; this.cellFocusAfterClick = null;
        if (hit && this.grid.contains(document.activeElement)) crFocus(this, hit);
      }, { signal });

      this.canvas.addEventListener("contextmenu", event => {
        const hit = crHit(this, event.target);
        // Links, buttons and other controls keep the browser's own context menu.
        if (!hit || event.target.closest(CR_CONTROLS)) return;
        event.preventDefault();
        if (this.cellTouching || event.pointerType === "touch") return;
        const inside = crRects(this).some(rect => hit.row >= rect.top && hit.row <= rect.bottom && crIndex(this, hit.column) >= rect.left && crIndex(this, hit.column) <= rect.right);
        if (!inside) { this.cellAnchor = { row: hit.row, column: hit.column }; if (this.cellRanges.length) { this.cellRanges = []; crChanged(this); } }
        crMenu(this, hit.cell);
      }, { signal });
      this.grid.addEventListener("paste", event => {
        if (!options.paste || event.target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])") || !this.canvas.contains(event.target)) return;
        const text = event.clipboardData?.getData("text/plain");
        if (typeof text !== "string") return;
        event.preventDefault();
        crPaste(this, text, null, "clipboard").catch(error => this.emit("error", { error }));
      }, { signal });
      if (this.overflow) this.overflow.panel.prepend(gridDecorateButton(gridButton(this.labels.gridCopyCells, () =>
        this.copyCellRanges().catch(error => this.emit("error", { error }))), "copy", true));
      signal.addEventListener("abort", () => { this.cellDrag?.(); this.pasteReport?.remove(); }, { once: true });
    },

    /** The ranges, each { startRow, endRow, startColumn, endColumn }: row positions in the shown order and column ids, inclusive. */
    getCellRanges() {
      return gridFreeze((this.cellRanges ? crRects(this) : []).map(rect => ({ startRow: rect.top, endRow: rect.bottom, startColumn: this.cols[rect.left].id, endColumn: this.cols[rect.right].id })));
    },
    setCellRanges(ranges) {
      this.startCellRanges();
      if (!Array.isArray(ranges) || ranges.length > 1000 || ranges.length > 1 && !this.cellOptions.multiple) crBad("setCellRanges takes up to 1000 ranges, one unless multiple ranges are on");
      this.cellRanges = ranges.map(range => ({ anchor: crAt(this, range?.startRow, range?.startColumn, "setCellRanges"), end: crAt(this, range.endRow ?? range.startRow, range.endColumn ?? range.startColumn, "setCellRanges") }));
      this.cellAnchor = this.cellRanges[0]?.anchor || null; this.cellHandles = false;
      crChanged(this);
    },
    clearCellRanges() {
      this.startCellRanges();
      if (!this.cellRanges?.length) return;
      this.cellRanges = []; this.cellHandles = false; crChanged(this);
    },
    selectAllCells() {
      this.startCellRanges();
      const bounds = crBounds(this);
      if (bounds.last < bounds.first || !this.cols?.length) return;
      this.setCellRanges([{ startRow: bounds.first, endRow: bounds.last, startColumn: this.cols[0].id, endColumn: this.cols[this.cols.length - 1].id }]);
    },
    /** The ranges (or the focused cell) as tab-separated text, loading rows that are not in the cache. */
    async getCellRangeText(options = {}) {
      this.startCellRanges();
      crCopyOptions(options);
      const blocks = crBlocks(this, crCopyRects(this));
      return crContent(this, blocks, await crLoad(this, blocks), options).text;
    },
    /** Copies the ranges (or the focused cell) to the clipboard as text and a typed table; resolves with the text. */
    async copyCellRanges(options = {}) {
      this.startCellRanges();
      crCopyOptions(options);
      const blocks = crBlocks(this, crCopyRects(this));
      if (!blocks.length) crBad("copying needs a range or a focused cell");
      const content = crContent(this, blocks, await crLoad(this, blocks), options);
      await crWrite(this, content); crCopied(this, content);
      return content.text;
    },
    /** Pastes tab-separated text at a row position and column, or at the ranges; resolves with { applied, refused, cancelled }. */
    pasteCells(text, at) {
      this.startCellRanges();
      return crPaste(this, text, at === undefined ? null : crAt(this, at?.row, at?.column, "pasteCells"), "api");
    }
  });
