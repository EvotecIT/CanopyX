  // ---------- flat-grid model and accepted query lifetime ----------
  class DataGrid {
    constructor(host, options) {
      const definition = validateGridView(options.view);
      this.view = JSON.parse(JSON.stringify(definition));
      this.host = host; this.opts = options; this.id = "cx" + ++instanceSeq;
      this.lifetime = new AbortController(); this.dataLifetime = new AbortController();
      this.source = options.source || (this.view.source.kind === "inline" ? inlineGridSource(this.view) : null);
      if (!this.source || typeof this.source.query !== "function") throw new Error("CanopyX: host grids need a query source.");
      this.cursor = this.view.source.navigation === "cursor";
      if (this.source.navigation !== undefined && this.source.navigation !== (this.cursor ? "cursor" : "offset"))
        throw new Error("CanopyX: source navigation must match the grid definition.");
      this.pageSize = this.view.pageSize; this.rowH = this.view.rowHeight;
      this.paged = this.view.presentation === "paged"; this.pageLength = this.view.pageLength || 50; this.pageOffset = 0;
      this.searchDelayMs = options.searchDelayMs === undefined ? this.view.searchDelayMs === undefined ?
        this.view.source.kind === "inline" ? 0 : 300 : this.view.searchDelayMs : options.searchDelayMs;
      if (!Number.isInteger(this.searchDelayMs) || this.searchDelayMs < 0 || this.searchDelayMs > 5000)
        throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
      this.cachePageLimit = options.cachePageLimit === undefined ? 40 : options.cachePageLimit;
      this.requestTimeoutMs = options.requestTimeoutMs === undefined ? 30000 : options.requestTimeoutMs;
      if (!Number.isInteger(this.cachePageLimit) || this.cachePageLimit < 2 || this.cachePageLimit > 1000 ||
          !Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1 || this.requestTimeoutMs > 2147483647)
        throw new Error("CanopyX: invalid grid cache or request timeout.");
      const renderers = options.renderers || {};
      if (!renderers || typeof renderers !== "object" || Array.isArray(renderers) || Object.keys(renderers).some(id =>
          !this.view.columns.some(column => column.id === id) || typeof renderers[id] !== "function"))
        throw new Error("CanopyX: grid renderers are functions by declared column ID.");
      this.columns = this.view.columns.map(column => Object.assign({}, column, {
        width: Math.min(MAX_COLUMN_WIDTH, column.width), render: Object.prototype.hasOwnProperty.call(renderers, column.id) ? renderers[column.id] : null
      }));
      this.lang = document.documentElement.lang || undefined;
      this.labels = labelsFor(this.view.labels, options.labels); this.local = this.view.timeZone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels); this.multi = this.view.selection === "multiple";
      this.queryAware = true; this.queryEpoch = 0; this.version = 1; this.total = 0;
      this.pages = new Map(); this.rowCache = new Map(); this.placeholders = new Map(); this.pendingPages = new Map();
      this.rendered = new Map(); this.pool = []; this.selected = new Set(); this.focused = null; this.rafId = 0;
      this.prepareState();
      this.build();
      this.ready = this.initializeState();
    }

    emit(name, detail) {
      this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail: detail }));
      const callback = this.opts["on" + name[0].toUpperCase() + name.slice(1)];
      if (typeof callback === "function") {
        try { callback(detail); } catch (error) { if (global.console) global.console.error(error); }
      }
    }

    stateChanged() {
      if (this.destroyed || this.restoringEpoch === this.queryEpoch) return;
      clearTimeout(this.stateTimer);
      this.stateTimer = setTimeout(() => {
        if (this.destroyed) return;
        const state = this.getState(); this.writeStoredState(state); this.emit("state", { query: this.getQuery(), state: state });
      }, 200);
    }
    getQuery() { return this.acceptedQuery || null; }
    queryForChange(includeQueuedInput) {
      const query = this.pendingQuery || this.acceptedQuery || {};
      return includeQueuedInput && this.searchTimer != null && !this.searchComposing ?
        gridQueryStart(query, { search: this.searchInput.value }) : query;
    }

    async setQuery(input, paging) {
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      const length = paging ? paging.pageLength : this.pageLength;
      const initial = gridQuery(this.view, this.cursor ? { ...input, limit: length } : input);
      const desired = this.cursor ? 0 : Math.floor(initial.offset / length) * length;
      const same = this.acceptedQuery && gridResultShape(initial) === gridResultShape(this.acceptedQuery) && initial.revision === this.acceptedQuery.revision;
      let query = this.paged && !this.cursor ? gridQuery(this.view, { ...initial, offset: same ? Math.min(desired, Math.max(0, Math.ceil(this.rowCount() / length) - 1) * length) : 0 }) : initial;
      const epoch = ++this.queryEpoch;
      clearTimeout(this.searchTimer); this.searchTimer = null;
      this.dataLifetime.abort(); this.dataLifetime = new AbortController();
      const lifetime = this.dataLifetime;
      this.pendingPages.clear(); this.pendingQuery = query; this.setNotice(this.labels.loading, false);
      this.grid.setAttribute("aria-busy", "true");
      this.syncPager();
      try {
        let page = (this.cursor ? validateGridCursorPage : validateGridPage)(await this.requestPage(query, lifetime.signal), this.view, query, same ? this.snapshot : null);
        if (this.cursor && paging && paging.direction) this.validateCursorTransition(page, paging);
        if (this.paged && !this.cursor && !same && desired) {
          gridOperationActive(this, lifetime.signal);
          const offset = Math.min(desired, Math.max(0, Math.ceil(page.matched / length) - 1) * length);
          if (offset) {
            const snapshot = { revision: page.revision, total: page.total, matched: page.matched };
            query = gridQuery(this.view, { ...query, offset, revision: page.revision });
            page = validateGridPage(await this.requestPage(query, lifetime.signal), this.view, query, snapshot);
          }
        }
        gridOperationActive(this, lifetime.signal);
        const hadFocus = this.canvas.contains(document.activeElement), previousId = this.focused && this.focused.key;
        this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.focused = null;
        this.acceptedQuery = gridQuery(this.view, { ...query, revision: page.revision });
        this.snapshot = { revision: page.revision, total: page.total, matched: page.matched };
        this.pageLength = length; this.pageOffset = this.cursor ? page.offset : this.paged ? query.offset : 0;
        if (this.cursor) this.cursorWindow = { end: page.offset + page.items.length, next: page.nextCursor, previous: page.previousCursor };
        this.storePage(page); this.pendingQuery = null; this.lastFailedQuery = null; this.lastFailedPaging = null; this.version++;
        const hasRows = this.cursor ? page.items.length : page.matched;
        this.total = (this.cursor ? page.items.length : this.paged ? Math.min(length, page.matched - this.pageOffset) : page.matched) * this.rowH;
        this.grid.setAttribute("aria-rowcount", page.matched === null ? "-1" : String(page.matched + 1));
        this.grid.tabIndex = hasRows ? -1 : 0;
        this.syncScrollRange(this.paged ? 0 : query.offset * this.rowH); this.buildHeader();
        this.setNotice(hasRows ? "" : this.labels.searchNoResults, false); this.grid.setAttribute("aria-busy", "false");
        if (hadFocus) {
          this.focused = [...this.rowCache.values()].find(row => row.key === previousId) || this.rowCache.get(this.cursor ? page.offset : query.offset) || null;
        }
        this.render();
        if (hadFocus) { const element = this.focused && this.rendered.get(this.focused); (element || this.grid).focus({ preventScroll: true }); }
        this.host.setAttribute("data-cx-ready", "true");
        if (this.searchInput && !this.searchComposing && this.searchTimer == null) this.searchInput.value = query.search;
        this.syncQuerySummary();
        this.syncPager();
        this.emit("query", { query: this.acceptedQuery, revision: page.revision, total: page.total, matched: page.matched });
        this.stateChanged(); return this.getQuery();
      } catch (error) {
        if (epoch === this.queryEpoch && !this.destroyed) {
          this.pendingQuery = null; this.lastFailedQuery = initial; this.lastFailedPaging = { ...paging, pageLength: length };
          this.dataLifetime.abort(); this.dataLifetime = new AbortController();
          this.grid.setAttribute("aria-busy", "false"); this.setNotice(fill(this.labels.queryFailed, { error: error.message }), true);
          this.syncPager();
          this.emit("error", { error: error });
        }
        throw error;
      }
    }

    querySortHeader(id, event) {
      const previous = gridQuery(this.view, this.queryForChange(true)), sorts = previous.sort.slice();
      const found = sorts.findIndex(sort => sort.column === id), old = found >= 0 ? sorts[found].direction : null;
      const next = old === "asc" ? "desc" : old === "desc" ? null : "asc";
      const changed = event && event.shiftKey ? sorts.filter(sort => sort.column !== id) : [];
      if (next) changed.splice(event && event.shiftKey && found >= 0 ? Math.min(found, changed.length) : changed.length, 0, { column: id, direction: next });
      this.setQuery(gridQueryStart(previous, { sort: changed })).catch(() => {});
    }

    sort(sorts) {
      return this.setQuery(gridQueryStart(this.queryForChange(true), { sort: sorts }));
    }

    rowCount() { return this.cursor ? this.cursorWindow ? this.cursorWindow.end : 0 : this.snapshot ? this.snapshot.matched : 0; }
    rowBounds() { return { first: this.pageOffset, last: this.paged ? Math.min(this.rowCount(), this.pageOffset + this.pageLength) - 1 : this.rowCount() - 1 }; }
    rowTop(index) { return (index - this.pageOffset) * this.rowH; }
    rowAt(top) { const bounds = this.rowBounds(); return Math.max(bounds.first, Math.min(bounds.last, bounds.first + Math.floor(top / this.rowH))); }
    indexOf(row) {
      if (!row || this.paged && (row._ri < this.pageOffset || row._ri >= this.pageOffset + this.pageLength)) return -1;
      return this.rowCache.get(row._ri) === row || this.placeholders.get(row._ri) === row ? row._ri : -1;
    }
    rowItem(index) {
      if (index < 0 || index >= this.rowCount() || this.paged && (index < this.pageOffset || index >= this.pageOffset + this.pageLength)) return null;
      if (this.rowCache.has(index)) return this.rowCache.get(index);
      if (!this.placeholders.has(index)) this.placeholders.set(index, { _ri: index, hpx: this.rowH, status: "loading", h: { cells: {} } });
      const row = this.placeholders.get(index), page = this.pages.get(Math.floor(index / this.pageSize) * this.pageSize);
      row.status = page && page.error ? "error" : "loading"; return row;
    }

    render() {
      if (this.destroyed) return;
      this.renderPass();
      for (const [index, row] of this.placeholders) if (!this.rendered.has(row) && this.focused !== row) this.placeholders.delete(index);
      this.loadWindow();
    }

    observeDetail() {}
    trimInactiveCache() { this.trimPages(); }

    setSelection(ids) {
      if (this.destroyed) return;
      if (!Array.isArray(ids)) throw new Error("CanopyX: selection must be an array of row IDs.");
      ids.forEach(id => requireIdentifier(id, "selection ID"));
      const next = new Set(ids);
      if (this.view.selection === "none" && next.size || !this.multi && next.size > 1) throw new Error("CanopyX: selection exceeds the view's mode.");
      this.selected = next; this.version++; this.scheduleRender(); this.emit("select", { ids: [...next] });
      this.stateChanged();
    }

    setColumnVisible(id, visible) {
      const column = this.columns.find(item => item.id === id);
      if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
      if (!visible && this.visibleColumns().length === 1 && !column.hidden) throw new Error("CanopyX: keep at least one column visible.");
      column.hidden = !visible; this.buildHeader(); this.scheduleRender(); this.stateChanged();
      this.syncColumnControls();
    }

    destroy() {
      if (this.destroyed) return;
      this.writeStoredState(this.getState());
      this.destroyed = true; this.queryEpoch++; this.lifetime.abort(); this.dataLifetime.abort();
      if (this.rafId) cancelAnimationFrame(this.rafId);
      clearTimeout(this.searchTimer); this.searchTimer = null;
      clearTimeout(this.stateTimer);
      if (this.disposeControls) this.disposeControls();
      if (this.cancelResize) this.cancelResize();
      this.resizeObserver.disconnect();
      this.restoreHeight();
      this.host.classList.remove("cx-data-grid");
      this.grid.removeEventListener("wheel", this.onScaledWheel); this.grid.removeEventListener("touchstart", this.onScaledTouchStart);
      this.grid.removeEventListener("touchmove", this.onScaledTouchMove); this.grid.removeEventListener("touchend", this.onScaledTouchEnd);
      this.grid.removeEventListener("touchcancel", this.onScaledTouchEnd);
      this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.pendingPages.clear(); this.rendered.clear(); this.pool.length = 0;
      this.toolbar.remove(); this.grid.remove(); this.notice.remove(); this.live.remove();
      if (this.pager) this.pager.remove();
      this.host.removeAttribute("data-cx-ready"); this.host.removeAttribute("data-canopyx-mounted");
    }
  }
  // Reuse the canonical column sizing, cell formatting and focus helpers without tree hierarchy or expanders.
  Object.assign(DataGrid.prototype, ROW_SCROLLING, ROW_DOM_ORDER, ROW_VIEWPORT, ROW_HELPERS);
