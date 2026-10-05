  // ---------- flat-grid scaffold, shared cells and accessible header ----------
  Object.assign(DataGrid.prototype, {
    build() {
      const host = this.host, style = host.style, signal = this.lifetime.signal;
      const minimum = style.getPropertyValue("--cx-min-h"), priority = style.getPropertyPriority("--cx-min-h");
      this.restoreHeight = () => style.setProperty("--cx-min-h", minimum, priority);
      style.removeProperty("--cx-min-h");
      host.classList.add("cx-host", "cx-data-grid");
      if (!host.hasAttribute("data-cx-theme")) host.setAttribute("data-cx-theme", "auto");
      style.setProperty("--cx-row-h", this.rowH + "px");
      this.toolbar = h("div", "cx-toolbar"); this.toolbar.hidden = this.opts.toolbar === false;
      if (this.view.search) this.buildGridSearch();
      this.buildGridControls();
      this.buildQuerySummary();
      const grid = this.grid = h("div", "cx-grid"); grid.id = this.id; grid.tabIndex = -1;
      grid.setAttribute("role", "grid"); grid.setAttribute("aria-label", this.view.label);
      if (this.multi) grid.setAttribute("aria-multiselectable", "true");
      this.head = h("div", "cx-head"); this.head.setAttribute("role", "rowgroup");
      this.headRow = h("div", "cx-hrow"); this.headRow.setAttribute("role", "row"); this.headRow.setAttribute("aria-rowindex", "1");
      this.head.appendChild(this.headRow); this.canvas = h("div", "cx-canvas"); this.canvas.setAttribute("role", "rowgroup");
      grid.appendChild(this.head); grid.appendChild(this.canvas);
      this.notice = h("div", "cx-grid-notice"); this.notice.hidden = true;
      this.live = h("div", "cx-live cx-sr-only"); this.live.setAttribute("aria-live", "polite");
      host.appendChild(this.toolbar); host.appendChild(grid); host.appendChild(this.notice); host.appendChild(this.live);
      this.buildPager();
      this.buildHeader();
      grid.addEventListener("scroll", () => { this.scheduleRender(); this.stateChanged(); }, { passive: true, signal: signal });
      grid.addEventListener("click", event => this.onClick(event), { signal: signal });
      grid.addEventListener("dblclick", event => {
        const element = event.target.closest(".cx-row"), row = element && element._w;
        if (row && !row.status && typeof this.opts.onDetails === "function" && !event.target.closest("a,button,input,select,textarea,[contenteditable]"))
          Promise.resolve().then(() => this.openDetails(row.key)).catch(error => this.emit("error", { error: error }));
      }, { signal: signal });
      grid.addEventListener("keydown", event => this.onKey(event), { signal: signal });
      this.canvas.addEventListener("focusin", event => {
        const element = event.target.closest(".cx-row");
        if (element && element._w && this.pendingNavigation && this.pendingQuery && element._w._ri !== this.pendingNavigation.index)
          this.pendingNavigation = null;
        if (element && element._w && this.focused !== element._w) {
          this.pendingNavigation = null; this.focused = element._w; this.scheduleRender();
        }
      }, { signal: signal });
      document.addEventListener("focusin", event => {
        if (this.pendingNavigation && this.pendingNavigation.focus && !this.canvas.contains(event.target)) this.pendingNavigation = null;
      }, { signal: signal });
      this.canvas.addEventListener("focusout", event => this.settleCell(event.relatedTarget), { signal: signal });
      this.resizeObserver = new ResizeObserver(() => {
        if (this.destroyed || !grid.clientWidth || !grid.checkVisibility()) return;
        style.setProperty("--cx-min-h", (this.toolbar.hidden ? 0 : [...host.children].reduce((height, child) =>
          height + (child === grid ? 0 : child.offsetHeight), this.rowH * 4 + 2)) + "px");
        if (!this.hasGridSize()) return;
        this.applyWidths();
        if (this.hiddenScrollTop !== undefined) {
          const top = this.hiddenScrollTop; delete this.hiddenScrollTop; this.setLogicalTop(top);
        }
        this.scheduleRender();
      });
      this.resizeObserver.observe(grid);
    },

    setLogicalTop(top) {
      if (!this.hasGridSize()) { this.hiddenScrollTop = top; return; }
      return ROW_SCROLLING.setLogicalTop.call(this, top);
    },

    logicalTop() { return this.hiddenScrollTop ?? ROW_SCROLLING.logicalTop.call(this); },

    hasGridSize() { return !!(this.grid.clientWidth && this.grid.clientHeight && this.grid.checkVisibility()); },

    setNotice(text, error) {
      this.notice.textContent = ""; this.notice.hidden = !text;
      this.notice.setAttribute("role", error ? "alert" : "status");
      if (error) {
        const retry = h("button", "cx-button cx-grid-retry"); retry.type = "button"; setText(retry, text);
        retry.addEventListener("click", () => this.retry().catch(() => {}), { signal: this.lifetime.signal }); this.notice.appendChild(retry);
      } else setText(this.notice, text);
    },

    buildHeader() {
      const sorts = this.acceptedQuery ? this.acceptedQuery.sort : [];
      this.sortState = sorts[0] || null; ROW_HELPERS.buildHeader.call(this);
      for (const cell of this.headCells) {
        const index = sorts.findIndex(sort => sort.column === cell.getAttribute("data-cx-column"));
        if (index >= 0) {
          cell.setAttribute("aria-sort", sorts.length === 1 ? sorts[index].direction === "asc" ? "ascending" : "descending" : "other");
          cell.setAttribute("data-cx-sort", sorts[index].direction); cell.setAttribute("data-cx-sort-priority", String(index + 1));
          const button = cell.querySelector(".cx-sort");
          button.setAttribute("data-cx-sort-priority", String(index + 1));
          button.setAttribute("aria-label", cell.getAttribute("aria-label") + ", " + sorts[index].direction + ", " + (index + 1));
        }
      }
    },

    cellOf(row, column) { return row.cells[column.id]; },
    refreshRowState(element, row) { setAttr(element, "aria-selected", row.status || this.view.selection === "none" ? null : String(this.selected.has(row.key))); },

    fillRow(element, row) {
      const kind = row.status ? "status" : "node";
      element._w = row;
      if (element._kind !== kind || element._layout !== this.layout) {
        element.textContent = ""; element._kind = kind; element._layout = this.layout; element._attrs = {}; element._cls = null;
        element.setAttribute("role", "row"); element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
        element._cells = (row.status ? [null] : this.cols).map((column, index) => {
          const cell = this.cell(element, index, column ? column.width : this.rowWidth, column ? column.kind : null);
          if (!column) cell.setAttribute("aria-colspan", String(this.cols.length));
          const slot = { cell: cell, content: cell, base: cell.className + (column?.wrap ? " cx-wrap" : ""), cls: null, title: null, badges: [], mode: "default" };
          slot.textSpan = cell.appendChild(h("span", "cx-text")); slot.text = slot.textSpan.appendChild(document.createTextNode("")); return slot;
        });
      }
      setClass(element, "cx-row" + (row.status ? " cx-status cx-" + row.status : this.autoRows ? " cx-auto-row" : ""));
      if (this.autoRows) {
        element.style.height = row.status ? this.rowH + "px" : "auto";
        this.observeDetail(element, !row.status);
        this.measureNeeded = true;
      }
      setAttr(element, "data-cx-id", row.key || null); setAttr(element, "data-cx-status", row.status || null);
      setAttr(element, "aria-busy", row.status === "loading" ? "true" : null); this.refreshRowState(element, row);
      if (row.status) element._cells[0].text.data = row.status === "error" ? fill(this.labels.loadError, {
        error: ((this.pages.get(Math.floor(row._ri / this.pageSize) * this.pageSize) || {}).error || {}).message || ""
      }) : this.labels.loading;
      else for (let i = 0; i < this.cols.length; i++) {
        const slot = element._cells[i];
        if (slot.highlighted) { slot.cls = null; slot.highlighted = false; }
        this.paintSlot(slot, row.h, this.cols[i], this.columnIndex[i], row);
      }
      this.paintGridHighlights(element, row);
    }
  });
