  // ---------- flat-grid model and accepted query lifetime ----------
  class DataGrid {
    constructor(host, options) {
      const { rows, rowData, ...definition } = validateGridView(options.view), owned = parsedViews.has(options.view);
      // A host's view is copied, so later changes to it cannot reach the grid; the rows of a view the runtime parsed from the
      // page belong to no one else, and copying a large inline dataset would double its parse time and peak memory.
      this.view = JSON.parse(JSON.stringify(definition));
      if (this.view.rowIdentity === "ordinal" && options.live)
        throw new Error("CanopyX: ordinal row identity is snapshot-local; keyed live updates require stable row keys.");
      if (rows) this.view.rows = owned ? rows : JSON.parse(JSON.stringify(rows));
      // The rows of rowData arrive in view.rows as the data part decodes them.
      // Structured cloning preserves invalid numeric values for the decoder to reject instead of converting them to null.
      if (rowData) { this.view.rowData = owned ? rowData : structuredClone(rowData); this.view.rows = []; }
      this.host = host; this.opts = options; this.id = "cx" + ++instanceSeq;
      this.lifetime = new AbortController(); this.dataLifetime = new AbortController();
      this.source = options.source || (this.view.source.kind === "inline" ? this.view.rowData ? rowDataSource(this) : inlineGridSource(this.view) : null);
      if (!this.source || typeof this.source.query !== "function") throw new Error("CanopyX: host grids need a query source.");
      this.cursor = this.view.source.navigation === "cursor";
      if (this.source.navigation !== undefined && this.source.navigation !== (this.cursor ? "cursor" : "offset"))
        throw new Error("CanopyX: source navigation must match the grid definition.");
      this.pageSize = this.view.pageSize; this.authoredAutoRows = this.view.rowHeight === "auto" || !!this.view.autoRowHeight ||
        this.view.autoRowHeight !== false && this.view.columns.some(column => column.wrap);
      this.autoRows = this.authoredAutoRows;
      this.rowH = this.view.rowHeight === "auto" ? this.view.estimatedRowHeight || (this.view.density === "compact" ? 32 : 40) : this.view.rowHeight;
      this.rowHeights = new Map();
      this.paged = this.view.presentation === "paged"; this.pageLength = this.view.pageLength || 50; this.pageOffset = 0;
      this.searchDelayMs = options.searchDelayMs === undefined ? this.view.searchDelayMs === undefined ?
        this.view.source.kind === "inline" ? 0 : 300 : this.view.searchDelayMs : options.searchDelayMs;
      if (!Number.isInteger(this.searchDelayMs) || this.searchDelayMs < 0 || this.searchDelayMs > 5000)
        throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
      this.cachePageLimit = options.cachePageLimit === undefined ? 40 : options.cachePageLimit;
      // Decoding row data is local work, which no request deadline bounds unless the host sets one.
      this.requestTimeoutMs = options.requestTimeoutMs === undefined ? rowData && !options.source ? 2147483647 : 30000 : options.requestTimeoutMs;
      if (!Number.isInteger(this.cachePageLimit) || this.cachePageLimit < 2 || this.cachePageLimit > 1000 ||
          !Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1 || this.requestTimeoutMs > 2147483647)
        throw new Error("CanopyX: invalid grid cache or request timeout.");
      this.kind = "grid"; this.plugins = viewPlugins(options, this.kind);
      const renderers = hostRenderers(options.renderers || {}, this.view.columns, this.plugins);
      this.columns = this.view.columns.map(column => ({ ...column,
        autoWidth: column.autoWidth || column.width === undefined,
        render: Object.hasOwn(renderers, column.id) ? renderers[column.id] : null
      }));
      this.lang = document.documentElement.lang || undefined;
      // Per-control toolbar switches: the document's toolbar object, then the host's options; a missing switch keeps its control.
      this.tools = Object.assign({}, this.view.toolbar, options.toolbar);
      if (Object.entries(this.tools).some(([name, value]) => !/^(search|filters|columns|views|export|more|count|columnMenus|matches|layout)$/.test(name) || typeof value !== "boolean"))
        throw new Error("CanopyX: toolbar options are booleans by control name.");
      this.labels = labelsFor(this.view.labels, options.labels); this.local = this.view.timeZone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels); this.multi = this.view.selection === "multiple";
      this.queryAware = true; this.queryEpoch = 0; this.version = 1; this.total = 0;
      this.pages = new Map(); this.rowCache = new Map(); this.placeholders = new Map(); this.pendingPages = new Map();
      this.rendered = new Map(); this.pool = []; this.selected = new Set(); this.focused = null; this.rafId = 0;
      this.prepareState();
      this.build();
      this.ready = this.initializeState();
    }

    // False when a listener cancelled the event or the callback returned false; only rowActivate has a default to cancel.
    emit(name, detail) {
      let go = this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail, cancelable: true }));
      const callback = this.opts["on" + name[0].toUpperCase() + name.slice(1)];
      if (typeof callback === "function") {
        try { go = callback(detail) !== false && go; } catch (error) { if (global.console) global.console.error(error); }
      }
      return go;
    }

    stateChanged() {
      if (this.destroyed || this.restoringEpoch === this.queryEpoch) return;
      clearTimeout(this.stateTimer);
      this.stateTimer = setTimeout(() => {
        if (this.destroyed) return;
        const state = this.getState(); this.writeStoredState(state); this.emit("state", { query: this.getQuery(), state });
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
      const footerPage = this.paged && this.view.source.kind === "host" && this.view.footers?.some(footer => footer.scope === "page");
      const initial = gridQuery(this.view, this.cursor || footerPage ? { ...input, limit: length } : input);
      const desired = this.cursor ? 0 : Math.floor(initial.offset / length) * length;
      const same = this.acceptedQuery && gridResultShape(initial) === gridResultShape(this.acceptedQuery) && initial.revision === this.acceptedQuery.revision;
      let query = this.paged && !this.cursor ? gridQuery(this.view, { ...initial, offset: same ? Math.min(desired, Math.max(0, Math.ceil(this.rowCount() / length) - 1) * length) : 0 }) : initial;
      const epoch = ++this.queryEpoch;
      clearTimeout(this.searchTimer); this.searchTimer = null;
      this.dataLifetime.abort(); this.dataLifetime = new AbortController();
      const lifetime = this.dataLifetime;
      this.pendingPages.clear(); this.pendingQuery = query; this.pendingPaging = paging ? { ...paging, pageLength: length } : null;
      this.setNotice(this.labels.loading, false);
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
        const retireSelection = this.view.rowIdentity === "ordinal" && this.snapshot && this.snapshot.revision !== page.revision;
        this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.focused = null;
        this.acceptedQuery = gridQuery(this.view, { ...query, revision: page.revision });
        this.snapshot = { revision: page.revision, total: page.total, matched: page.matched };
        if (retireSelection) this.clearSnapshotSelection();
        this.pageLength = length; if(paging)this.pageAll=!!paging.allRows; this.pageOffset = this.cursor ? page.offset : this.paged ? query.offset : 0;
        if (this.cursor) this.cursorWindow = { end: page.offset + page.items.length, next: page.nextCursor, previous: page.previousCursor };
        if (this.autoRows) { if (!same) this.rowHeights.clear(); this.rowOffsets = null; }
        this.storePage(page); this.pendingQuery = null; this.pendingPaging = null; this.lastFailedQuery = null; this.lastFailedPaging = null; this.version++;
        const hasRows = this.cursor ? page.items.length : page.matched;
        this.total = (this.cursor ? page.items.length : this.paged ? Math.min(length, page.matched - this.pageOffset) : page.matched) * this.rowH;
        this.grid.setAttribute("aria-rowcount", page.matched === null ? "-1" : String(page.matched + 1 + (this.headDepth || 0)));
        this.grid.tabIndex = hasRows ? -1 : 0;
        this.syncScrollRange(this.paged ? 0 : query.offset * this.rowH); this.buildHeader(); this.syncColumnControls();
        this.setNotice(hasRows ? "" : this.labels.searchNoResults, false); this.grid.setAttribute("aria-busy", "false");
        if (hadFocus || this.focusOrigin) {
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
          const cancelled = error?.name === "AbortError";
          this.pendingQuery = null; this.pendingPaging = null; this.lastFailedQuery = cancelled ? null : initial; this.lastFailedPaging = cancelled ? null : { ...paging, pageLength: length };
          this.dataLifetime.abort(); this.dataLifetime = new AbortController();
          this.grid.setAttribute("aria-busy", "false"); this.setNotice(cancelled ? "" : fill(this.labels.queryFailed, { error: error.message }), !cancelled);
          this.syncPager();
          if (!cancelled) this.emit("error", { error });
        }
        throw error;
      }
    }

    querySortHeader(id, event) {
      const previous = gridQuery(this.view, this.queryForChange(true)), sorts = previous.sort.slice();
      const found = sorts.findIndex(sort => sort.column === id), old = found >= 0 ? sorts[found].direction : null;
      const authored = this.columns.find(column => column.id === id).orderSequence;
      const sequence = authored?.length ? authored : ["asc", "desc", "none"];
      const direction = sequence[(sequence.indexOf(old || "none") + 1) % sequence.length];
      const next = direction === "none" ? null : direction;
      const changed = event && event.shiftKey ? sorts.filter(sort => sort.column !== id) : [];
      if (next) changed.splice(event && event.shiftKey && found >= 0 ? Math.min(found, changed.length) : changed.length, 0, { column: id, direction: next });
      this.setQuery(gridQueryStart(previous, { sort: changed })).catch(() => {});
    }

    sort(sorts) {
      return this.setQuery(gridQueryStart(this.queryForChange(true), { sort: sorts }));
    }

    rowCount() { return this.cursor ? this.cursorWindow ? this.cursorWindow.end : 0 : this.snapshot ? this.snapshot.matched : 0; }
    rowBounds() { return { first: this.pageOffset, last: this.paged ? Math.min(this.rowCount(), this.pageOffset + this.pageLength) - 1 : this.rowCount() - 1 }; }
    rowTop(index) { return this.autoRows && this.rowOffsets ? this.rowOffsets.top(index - this.pageOffset) : (index - this.pageOffset) * this.rowH; }
    rowAt(top) { const bounds = this.rowBounds(); return Math.max(bounds.first, Math.min(bounds.last, bounds.first +
      (this.autoRows && this.rowOffsets ? this.rowOffsets.at(top) : Math.floor(top / this.rowH)))); }
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
      if (this.destroyed || !this.sized) return;
      let measured = false;
      if (this.autoRows) this.syncRowOffsets();
      for (let pass = 0; ; pass++) {
        this.renderPass();
        if (!this.autoRows || !this.measureGridRows()) break;
        measured = true;
        if (pass === 3) { this.scheduleRender(); break; }
      }
      for (const [index, row] of this.placeholders) if (!this.rendered.has(row) && this.focused !== row) this.placeholders.delete(index);
      this.loadWindow();
      const origin = this.focusOrigin;
      if (origin && this.hasGridSize()) {
        this.focusOrigin = null;
        if (document.activeElement === origin) (this.rendered.get(this.focused) || this.grid).focus({ preventScroll: true });
      }
      return measured;
    }

    observeDetail() {}
    trimInactiveCache() { this.trimPages(); }

    // Query maintenance must not count as reader intent and cancel an in-flight saved-view restoration.
    clearSnapshotSelection() {
      const changed = this.selected.size || this.querySelection;
      this.selectionController?.abort(); this.selectionAnchor = null;
      this.querySelection = null; this.selectionExcluded = null; this.selected.clear();
      if (changed) { this.version++; this.scheduleRender(); this.emit("select", { ids: [] }); this.syncGridChrome(); }
    }

    setSelection(ids) {
      if (this.destroyed) return;
      if (!Array.isArray(ids)) throw new Error("CanopyX: selection must be an array of row IDs.");
      ids.forEach(id => requireIdentifier(id, "selection ID"));
      const next = new Set(ids);
      if (this.view.selection === "none" && next.size || !this.multi && next.size > 1) throw new Error("CanopyX: selection exceeds the view's mode.");
      this.selected = next; this.version++; this.scheduleRender(); this.emit("select", { ids: [...next] });
      this.syncGridChrome();
      this.stateChanged();
    }

    setColumnVisible(id, visible) {
      const column = this.columns.find(item => item.id === id);
      if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
      if (!visible && this.columns.filter(item => !item.hidden).length === 1 && !column.hidden) throw new Error("CanopyX: keep at least one column visible.");
      column.hidden = !visible; this.buildHeader(); this.version++; this.scheduleRender(); this.stateChanged();
      this.syncColumnControls();
    }

    destroy() {
      if (this.destroyed) return;
      this.writeStoredState(this.getState());
      this.destroyed = true; this.queryEpoch++; this.lifetime.abort(); this.dataLifetime.abort();
      this.focusOrigin = null;
      for (const row of [...this.rendered.values(), ...this.pool]) disposeRowHostCells(row);
      if (this.rafId) cancelAnimationFrame(this.rafId);
      clearTimeout(this.searchTimer); this.searchTimer = null;
      clearTimeout(this.stateTimer);
      if (this.disposeControls) this.disposeControls();
      if (this.cancelResize) this.cancelResize();
      this.resizeObserver.disconnect();
      this.detailObserver?.disconnect(); this.rowHeights?.clear(); this.rowOffsets = null;
      this.restoreHeight();
      this.host.classList.remove("cx-data-grid","cx-chrome","cx-phone","cx-has-selection","cx-scroll-left","cx-scroll-right","cx-grid-awaiting","cx-pins");
      this.grid.removeEventListener("wheel", this.onScaledWheel); this.grid.removeEventListener("touchstart", this.onScaledTouchStart);
      this.grid.removeEventListener("touchmove", this.onScaledTouchMove); this.grid.removeEventListener("touchend", this.onScaledTouchEnd);
      this.grid.removeEventListener("touchcancel", this.onScaledTouchEnd);
      this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.pendingPages.clear(); this.rendered.clear(); this.pool.length = 0;
      this.toolbar.remove(); this.grid.remove(); this.notice.remove(); this.live.remove();
      this.querySummary?.remove();
      if (this.pager) this.pager.remove();
      this.statusBar?.remove(); this.groupBar?.remove(); this.statusAggregateController?.abort();
      this.host.removeAttribute("data-cx-ready"); this.host.removeAttribute("data-canopyx-mounted");
    }
  }
  // Reuse the canonical column sizing, cell formatting and focus helpers without tree hierarchy or expanders.
  Object.assign(DataGrid.prototype, ROW_SCROLLING, ROW_DOM_ORDER, ROW_VIEWPORT, ROW_HELPERS);
