  // ---------- live data: hosted grids ----------
  // A hosted grid's data lives with its source. refreshRows asks the source again for the pages the grid holds (at most
  // four: the first page, the focused row's and the ones the reader sees), without a revision: an unchanged revision changes
  // nothing; a new one replaces the rows in place and keeps the reader's place. With the stable order, when the rows the
  // reader sees would change places, they keep their places with their new values and the prompt offers Re-sort, which
  // shows the new order (so does scrolling to rows the grid has not loaded); polls at that same revision change nothing more.
  // A grouped or summarised view runs its query again. A cursor grid offers New data and Refresh, which reads its first page
  // again. Updates a host pushes with applyTransaction change the loaded rows in place; rows are added and removed at the source.
  Object.assign(DataGrid.prototype, {
    /** The offsets of the pages a refresh asks for: the first page, the focused row's, then the pages the view shows. */
    liveHeldOffsets() {
      const offsets = new Set([0]), bounds = this.rowBounds(), size = this.pageSize;
      if (this.focused && this.focused._ri >= 0) offsets.add(Math.floor(this.focused._ri / size) * size);
      if (this.paged) offsets.add(Math.floor(this.pageOffset / size) * size);
      for (const range of this.window ? this.window.ranges || [this.window] : [])
        for (let page = Math.floor(Math.max(bounds.first, range.first) / size) * size; page <= Math.min(bounds.last, range.last); page += size) offsets.add(page);
      return [...offsets].slice(0, 4).sort((a, b) => a - b);
    },
    async liveRefreshHost(force) {
      if (this.cursor) return this.liveRefreshCursor();
      const offsets = this.liveHeldOffsets(), lifetime = this.dataLifetime, epoch = this.queryEpoch, accepted = this.acceptedQuery;
      const ask = async (offset, snapshot) => {
        const query = gridQuery(this.view, { ...accepted, offset, limit: this.pageSize, revision: snapshot ? snapshot.revision : undefined });
        const page = validateGridPage(await this.requestPage(query, lifetime.signal), this.view, query, snapshot);
        if (this.destroyed || epoch !== this.queryEpoch || this.acceptedQuery !== accepted) throw new DOMException("The refresh was superseded.", "AbortError");
        return page;
      };
      const first = await ask(0, null);
      if (!force && (first.revision === this.snapshot.revision || first.revision === this.livePending?.snapshot?.revision)) return null;
      const snapshot = { revision: first.revision, total: first.total, matched: first.matched };
      if (this.liveProjected()) {
        this.livePending = null; this.liveMoved = false;
        await this.liveRequery(new Map(), []);
        return { changed: new Map(), removed: [], orderChanged: false, revision: this.snapshot.revision };
      }
      const pages = new Map([[0, first.items]]);
      for (const offset of offsets) if (offset && offset < snapshot.matched) pages.set(offset, (await ask(offset, snapshot)).items);
      const position = new Map(), fresh = new Map();
      for (const [offset, items] of pages) items.forEach((item, index) => { position.set(item.id, offset + index); fresh.set(item.id, item); });
      const changed = new Map(), held = new Map();
      for (const row of this.rowCache.values()) if (!row.status) held.set(row.key, row);
      for (const [id, item] of fresh) { const row = held.get(id), columns = row ? liveChangedColumns(row.h, item) : "*"; if (columns === "*" || columns.size) changed.set(id, columns); }
      // The rows the reader sees keep their order when the ones still there come in the same order.
      const seen = [...this.rendered.keys()].filter(row => !row.status && row.key).sort((a, b) => a._ri - b._ri).map(row => row.key);
      const before = seen.filter(id => position.has(id)), after = [...before].sort((a, b) => position.get(a) - position.get(b));
      const moved = before.some((id, index) => id !== after[index]);
      if (moved && this.liveOpts.stableOrder && !force) {
        this.liveSetHeld(fresh, false);
        this.livePending = { snapshot, pages };
        this.liveSyncPrompt();
        return { changed, removed: [], orderChanged: true, revision: snapshot.revision };
      }
      this.livePending = null; this.liveMoved = false;
      this.liveSwap(snapshot, () => pages, id => position.get(id) ?? -1, changed, []);
      this.liveSyncPrompt();
      return { changed, removed: [], orderChanged: false, revision: snapshot.revision };
    },
    async liveRefreshCursor() {
      const query = gridQuery(this.view, { ...this.acceptedQuery, cursor: undefined, revision: undefined, limit: this.pageLength });
      const page = validateGridCursorPage(await this.requestPage(query, this.dataLifetime.signal), this.view, query, null);
      if (this.destroyed || page.revision === this.snapshot.revision || page.revision === this.livePending?.revision) return null;
      this.livePending = { cursor: true, revision: page.revision }; this.liveSyncPrompt();
      return { changed: new Map(), removed: [], orderChanged: false, newData: true, revision: page.revision };
    },
    /**
     * Gives loaded rows new values in place, by id: complete rows (merge false) or updates (merge true). Pending edits are
     * drawn again over them. Returns the rows that changed and whether a change touched the sort, filters or search.
     */
    liveSetHeld(changes, merge) {
      const changed = new Map(), loaded = new Set(), pages = new Set(), query = this.acceptedQuery, used = new Set(query.sort.map(sort => sort.column));
      const walk = group => { if (!group) return; for (const filter of group.filters) used.add(filter.column); group.groups.forEach(walk); };
      for (const filter of query.filters) used.add(filter.column);
      walk(query.filterGroup);
      const searched = !!query.search;
      let moved = false;
      for (const row of this.rowCache.values()) {
        const change = !row.status && changes.get(row.key);
        if (!change) continue;
        loaded.add(row.key);
        const after = merge ? liveMerged(row.h, change) : liveCopy(change), columns = liveChangedColumns(row.h, after);
        if (!columns.size && liveSameRow(row.h, after)) continue;
        row.h = after; changed.set(row.key, columns); pages.add(Math.floor(row._ri / this.pageSize) * this.pageSize);
        if (searched || [...columns].some(id => used.has(id))) moved = true;
      }
      for (const offset of pages) { const page = this.pages.get(offset); if (page?.rows) this.storePage({ offset, items: page.rows.map(row => row.h) }); }
      if (changed.size) {
        this.version++; this.scheduleRender();
        const positions = new Map([...this.rowCache.values()].map(row => [row.key, row._ri]));
        this.liveAfterChange(changed, [], id => positions.get(id) ?? -1, false);
      }
      return { changed, moved, loaded };
    }
  });

  // Rows the grid has not loaded belong to the newer result: scrolling to them while the old order shows applies it first.
  const LIVE_WINDOW = DataGrid.prototype.loadWindow;
  DataGrid.prototype.loadWindow = function () {
    const pending = this.livePending;
    if (pending?.pages && this.window && this.snapshot && !this.pendingQuery && !this.destroyed) {
      const bounds = this.rowBounds();
      for (const range of this.window.ranges || [this.window])
        for (let index = Math.max(bounds.first, range.first); index <= Math.min(bounds.last, range.last); index++)
          if (!this.rowCache.has(index)) {
            if (!pending.applying) { pending.applying = true; queueMicrotask(() => this.destroyed || this.livePending !== pending || this.resort().catch(error => this.emit("error", { error }))); }
            return;
          }
    }
    return LIVE_WINDOW.call(this);
  };
