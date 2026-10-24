  // ---------- flat-grid scaffold, shared cells and accessible header ----------
  Object.assign(DataGrid.prototype, {
    build() {
      const host = this.host, style = host.style, signal = this.lifetime.signal;
      const minimum = style.getPropertyValue("--cx-min-h"), priority = style.getPropertyPriority("--cx-min-h"),rowHeight=style.getPropertyValue("--cx-row-h"),rowPriority=style.getPropertyPriority("--cx-row-h"),density=host.getAttribute("data-cx-density"),maximum=style.maxHeight;
      this.restoreHeight = () => {style.maxHeight=maximum;style.setProperty("--cx-min-h",minimum,priority);style.setProperty("--cx-row-h",rowHeight,rowPriority);if(density===null)host.removeAttribute("data-cx-density");else host.setAttribute("data-cx-density",density);};
      style.removeProperty("--cx-min-h");
      host.classList.add("cx-host", "cx-data-grid", "cx-chrome");
      host.classList.toggle("cx-row-accents", !!this.view.rowAccents);
      host.setAttribute("data-cx-density", this.view.density || "default");
      if (!host.hasAttribute("data-cx-theme")) host.setAttribute("data-cx-theme", "auto");
      style.setProperty("--cx-row-h", this.rowH + "px");
      this.toolbar = h("div", "cx-toolbar"); this.toolbar.hidden = this.opts.toolbar === false;
      if (this.view.search && this.tools.search !== false) this.buildGridSearch();
      this.buildGridControls();
      this.buildGridChrome();
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
      host.append(this.toolbar, this.querySummary);
      if (this.groupBar) host.appendChild(this.groupBar);
      host.append(this.notice, grid, this.live);
      this.buildPager();
      this.buildGridStatus();
      this.buildHeader();
      grid.addEventListener("scroll", () => { this.scheduleRender(); this.syncPinnedShadows(); this.stateChanged(); }, { passive: true, signal });
      grid.addEventListener("click", event => this.onClick(event), { signal }); grid.addEventListener("pointerover", event => this.cellTip(event), { signal });
      grid.addEventListener("dblclick", event => {
        const element = event.target.closest(".cx-row"), row = element && element._w;
        if (row && !row.status && !event.target.closest("a,button,input,select,textarea,[contenteditable]") && !this.clickAction(element))
          this.activateRow(row, false);
      }, { signal });
      grid.addEventListener("keydown", event => this.onKey(event), { signal });
      if (this.view.dragRows) {
        grid.addEventListener("dragstart", event => this.gridDragStart(event), { signal });
        grid.addEventListener("dragend", () => { GRID_DRAG.item = null; }, { signal });
      }
      this.canvas.addEventListener("focusin", event => {
        const element = event.target.closest(".cx-row");
        if (element && element._w && this.pendingNavigation && this.pendingQuery && element._w._ri !== this.pendingNavigation.index)
          this.pendingNavigation = null;
        if (element && element._w && this.focused !== element._w) {
          this.pendingNavigation = null; this.focused = element._w; this.scheduleRender();
        }
      }, { signal });
      document.addEventListener("focusin", event => {
        if (this.pendingNavigation && this.pendingNavigation.focus && !this.canvas.contains(event.target)) this.pendingNavigation = null;
        if (this.focusOrigin && event.target !== this.focusOrigin) this.focusOrigin = null;
      }, { signal, capture: true });
      document.addEventListener("focusout", event => {
        if (event.target === this.focusOrigin) this.focusOrigin = null;
      }, { signal, capture: true });
      this.canvas.addEventListener("focusout", event => this.settleCell(event.relatedTarget), { signal });
      // The observer refreshes this after container changes; ordinary scrolling needs no extra layout reads.
      this.sized = this.hasGridSize();
      // Keep the first visible paint fitted without changing observed ancestors during resize delivery.
      // Opacity suppresses paint while preserving native focus requested at data readiness.
      grid.style.opacity = "0";
      let resizeFrame;
      signal.addEventListener("abort", () => cancelAnimationFrame(resizeFrame), { once: true });
      this.resizeObserver = new ResizeObserver(entries => {
        const size = entries.find(entry => entry.target === grid);
        if (size) this.fitContentWidth = size.contentRect.width;
        if (size && !size.contentRect.width) grid.style.opacity = "0";
        const resize = () => {
          if (this.destroyed) return;
          if (!grid.clientWidth || !grid.checkVisibility()) { this.sized = false; return; }
          style.setProperty("--cx-min-h", (this.toolbar.hidden ? 0 : [...host.children].reduce((height, child) =>
            height + (child === grid ? 0 : child.offsetHeight), this.rowH * Math.min(4, Math.max(1, this.rowCount())) + 2)) + "px");
          this.fitHeight();
          if (!(this.sized = this.hasGridSize())) return;
          this.applyWidths();
          this.updateGridPhone();
          this.fitHeight();
          this.viewportHeight = grid.clientHeight - this.head.offsetHeight;
          if (this.hiddenScrollTop !== undefined) {
            const top = this.hiddenScrollTop; delete this.hiddenScrollTop; this.setLogicalTop(top);
          }
          if (grid.style.opacity) { this.render(); grid.style.opacity = ""; }
          else this.scheduleRender();
        };
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
      });
      this.resizeObserver.observe(grid);
      this.resizeObserver.observe(this.head);
    },

    setLogicalTop(top) {
      if (!this.hasGridSize()) { this.hiddenScrollTop = top; return; }
      return ROW_SCROLLING.setLogicalTop.call(this, top);
    },

    logicalTop() { return this.hiddenScrollTop ?? ROW_SCROLLING.logicalTop.call(this); },

    hasGridSize() { return !!(this.grid.clientWidth && this.grid.clientHeight && this.grid.checkVisibility()); },

    buildHeader() {
      const sorts = this.acceptedQuery ? this.acceptedQuery.sort : [];
      this.sortState = sorts[0] || null; ROW_HELPERS.buildHeader.call(this);
      for (const cell of this.headCells) {
        const button = cell.querySelector(".cx-sort");
        if (button) { const label = h("span", "cx-htext"); setText(label, button.textContent); button.replaceChildren(label); }
        const index = sorts.findIndex(sort => sort.column === cell.getAttribute("data-cx-column"));
        if (index >= 0) {
          cell.setAttribute("aria-sort", sorts.length === 1 ? sorts[index].direction === "asc" ? "ascending" : "descending" : "other");
          cell.setAttribute("data-cx-sort", sorts[index].direction); cell.setAttribute("data-cx-sort-priority", String(index + 1));
          button.setAttribute("data-cx-sort-priority", String(index + 1));
          if (sorts.length > 1) { const priority = h("sup", "cx-sort-priority"); setText(priority, String(index + 1)); button.appendChild(priority); }
          button.setAttribute("aria-label", cell.getAttribute("aria-label") + ", " + sorts[index].direction + ", " + (index + 1));
        }
      }
      this.buildHeaderSelection?.();
      this.buildColumnMenus?.();
    },

    cellOf(row, column) { return row.cells[column.id]; },
    refreshRowState(element, row) { setAttr(element, "aria-selected", row.status || this.view.selection === "none" ? null : String(this.selected.has(row.key))); },

    fillRow(element, row) {
      const kind = row.status ? "status" : "node";
      element._w = row;
      if (element._kind !== kind || element._layout !== this.layout) {
        disposeRowHostCells(element);
        element.textContent = ""; element._kind = kind; element._layout = this.layout; element._attrs = {}; element._cls = null;
        element.setAttribute("role", "row"); element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
        element._cells = (row.status ? [null] : this.cols).map((column, index) => {
          const cell = this.cell(element, index, column ? column.width : this.rowWidth, column ? column.kind : null);
          if (!column) cell.setAttribute("aria-colspan", String(this.cols.length));
          // Native selection chrome keeps its cell while a host renderer replaces only its owned content.
          const content = index === 0 && column?.render && this.view.reporting?.selectionControls ? cell.appendChild(h("span", "cx-content")) : cell;
          const slot = { cell, content, base: cell.className + (column?.wrap ? " cx-wrap" : ""), cls: null, title: null, badges: [], mode: "default" };
          slot.textSpan = content.appendChild(h("span", "cx-text")); slot.text = slot.textSpan.appendChild(document.createTextNode("")); return slot;
        });
      }
      setClass(element, "cx-row" + (row.status ? " cx-status cx-" + row.status : this.autoRows ? " cx-auto-row" : ""));
      if (this.autoRows) {
        element.style.height = row.status ? this.rowH + "px" : "auto";
        this.observeDetail(element, !row.status);
        this.measureNeeded = true;
      } else element.style.height = this.rowH + "px";
      setAttr(element, "data-cx-id", row.key || null); setAttr(element, "data-cx-status", row.status || null);
      setAttr(element, "draggable", this.view.dragRows && !row.status ? "true" : null);
      setAttr(element, "aria-busy", row.status === "loading" ? "true" : null); this.refreshRowState(element, row);
      if (row.status) element._cells[0].text.data = row.status === "error" ? fill(this.labels.loadError, {
        error: ((this.pages.get(Math.floor(row._ri / this.pageSize) * this.pageSize) || {}).error || {}).message || ""
      }) : this.labels.loading;
      else for (let i = 0; i < this.cols.length; i++) {
        const slot = element._cells[i];
        if (slot.highlighted) { slot.cls = null; slot.highlighted = false; }
        const column=this.cols[i],cell=row.h.cells[column.id];
        this.paintSlot(slot, row.h, column, this.columnIndex[i], row);
        if(!column.render&&!slot.text.data&&!(isCellObject(cell)&&cellValue(cell)==null&&cell.text==="")){slot.text.data="—";slot.cell.classList.add("p-missing");slot.missing=true;}
        else if(slot.missing){slot.cell.classList.remove("p-missing");slot.missing=false;}
        if(this.phone||slot.hiddenFields||slot.phonePrimary)this.paintHiddenFields?.(slot,row.h,column,this.columnIndex[i]);
      }
      this.paintGridHighlights(element, row);
      if(row.status)this.paintGridSkeleton(element,row);
    }
  });
