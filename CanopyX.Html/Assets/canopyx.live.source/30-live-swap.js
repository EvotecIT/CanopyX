  // ---------- live data: the accepted result changes in place ----------
  // A live change keeps the accepted query, its sort, filters and search, and replaces the rows of the result without a new
  // query: the row objects the grid painted stay (so focus, an open editor and the rendered rows follow their records),
  // pending edits are drawn again over the new values, the row at the top of the view stays where it was (unless the view
  // is at its very start and the reader is elsewhere, so new rows at the top show), removed rows leave the selection, and an
  // open record drawer paints the record again at its new place. Pages still loading for the old result are retired. Views
  // whose rows are projected into groups, summaries or detail rows run their query again instead, keep the open drawer and
  // restore the same places.
  Object.assign(DataGrid.prototype, {
    liveInline() { return this.view.source.kind === "inline" && !this.opts.source; },
    /** Whether the accepted result needs group, summary, footer or detail projection. */
    liveProjected() {
      const reporting = this.view.reporting;
      return !!(this.view.footers?.length || reporting && (reporting.grouping || this.acceptedQuery?.groupBy?.length || reporting.aggregates?.length || reporting.detail) || this.opts.detail);
    },
    liveAnchor() {
      const top = this.logicalTop(), index = this.rowAt(top), row = this.rowCache.get(index);
      return { top, index, id: row && !row.status ? row.key : null, delta: top - this.rowTop(index) };
    },
    /**
     * Replaces the result: snapshot is { revision, total, matched }, pagesFor(anchorIndex, focusIndex) gives the pages to keep
     * (a Map of offset to owned rows), positionOf(id) a record's new position (-1 when it left), changed the rows by id that
     * changed (with their changed columns), removed the ids that are gone, and shifted whether positions may have moved.
     */
    liveSwap(snapshot, pagesFor, positionOf, changed, removed, shifted = true) {
      const hadFocus = this.canvas.contains(document.activeElement), anchor = this.liveAnchor(), old = new Map();
      const focused = this.focused, focusIndex = focused ? focused._ri : -1, focusId = focused && !focused.status ? focused.key : null;
      for (const row of this.rowCache.values()) old.set(row.key, row);
      const length = this.pageLength;
      if (this.paged && !this.cursor && this.pageOffset > 0 && this.pageOffset >= snapshot.matched)
        this.pageOffset = Math.max(0, Math.floor((snapshot.matched - 1) / length) * length);
      const anchorIndex = anchor.id === null ? -1 : positionOf(anchor.id), newFocus = focusId === null ? -1 : positionOf(focusId);
      const pages = pagesFor(anchorIndex >= 0 ? anchorIndex : anchor.index, newFocus);
      // Pages and navigation still under way read the old result: a new epoch retires them, as a new query would. Without
      // any, the epoch stays, so work that follows the accepted query (a value list, a range copy) is not cancelled.
      if (this.pendingPages.size || this.pendingNavigation) { this.queryEpoch++; this.pendingPages.clear(); this.pendingNavigation = null; }
      this.pages.clear(); this.rowCache.clear(); this.placeholders.clear();
      this.snapshot = { revision: snapshot.revision, total: snapshot.total, matched: snapshot.matched };
      const heights = this.autoRows ? new Map() : null;
      for (const [offset, items] of [...pages].sort((a, b) => a[0] - b[0])) {
        items.forEach((item, index) => {
          const row = old.get(item.id);
          if (!row) return;
          if (heights && this.rowHeights.has(row._ri)) heights.set(offset + index, this.rowHeights.get(row._ri));
          row.h = item; row._ri = offset + index; row.hpx = this.rowH; this.rowCache.set(row._ri, row);
        });
        this.storePage({ protocol: PROTOCOL, type: "gridPage", view: this.view.id, revision: snapshot.revision, offset, items });
      }
      const accepted = this.acceptedQuery, offset = this.paged && !this.cursor ? this.pageOffset : accepted.offset;
      if (accepted.revision !== snapshot.revision || accepted.offset !== offset) this.acceptedQuery = gridQuery(this.view, { ...accepted, offset, revision: snapshot.revision });
      this.version++;
      // Measured rows keep their heights at their new places, so the reader's place is computed from real offsets.
      if (heights) { this.rowHeights = heights; this.rowOffsets = null; this.syncRowOffsets(); }
      else this.total = (this.paged ? Math.max(0, Math.min(length, snapshot.matched - this.pageOffset)) : snapshot.matched) * this.rowH;
      this.grid.setAttribute("aria-rowcount", String(snapshot.matched + 1 + (this.headDepth || 0)));
      this.grid.tabIndex = snapshot.matched ? -1 : 0;
      let top = anchor.top;
      if (anchorIndex >= 0 && (anchor.top > 0 || hadFocus)) top = this.rowTop(anchorIndex) + anchor.delta;
      this.syncScrollRange(Math.max(0, Math.min(top, this.total)));
      if (focused) this.focused = newFocus >= 0 ? this.rowCache.get(newFocus) || this.rowItem(newFocus) :
        snapshot.matched ? this.rowItem(Math.max(this.rowBounds().first, Math.min(focusIndex, this.rowBounds().last))) : null;
      this.setNotice(snapshot.matched ? "" : this.labels.searchNoResults, false);
      this.render();
      if (hadFocus && !this.canvas.contains(document.activeElement)) { const element = this.focused && this.rendered.get(this.focused); (element || this.grid).focus({ preventScroll: true }); }
      this.syncQuerySummary(); this.syncPager(); this.syncGridChrome();
      this.liveAfterChange(changed, removed, positionOf, shifted);
    },
    /** What every live change ends with: selection, formatting bounds, highlight counts, the open drawer and flashing cells. */
    liveAfterChange(changed, removed, positionOf, shifted) {
      const gone = new Set(removed);
      if (this.querySelection) {
        // Select all matching: removed rows leave the exclusions, and the count follows the result.
        let touched = false;
        for (const id of gone) touched = this.selectionExcluded.delete(id) || touched;
        if (this.querySelection.matched !== this.snapshot.matched || this.querySelection.revision !== this.snapshot.revision) {
          this.querySelection = gridFreeze({ ...this.querySelection, matched: this.snapshot.matched, revision: this.snapshot.revision }); touched = true;
        }
        if (touched) this.publishQuerySelection?.();
      } else if (gone.size && [...this.selected].some(id => gone.has(id))) this.setSelection([...this.selected].filter(id => !gone.has(id)));
      if (this.formatStatsKey !== undefined) this.formatStatsKey = null;
      VIEW_MODES.refresh?.(this);
      const dialog = this.recordDrawer, id = dialog?.isConnected ? dialog.getAttribute("data-cx-record") : null;
      if (id && typeof dialog._cxPaint === "function" && (changed.has(id) || gone.has(id) || shifted)) {
        const index = gone.has(id) ? -1 : positionOf(id), row = index >= 0 ? this.rowCache.get(index) : null;
        const record = row ? row.h : index < 0 || !this.liveInline() ? null : this.liveRows().get(id);
        if (record) dialog._cxPaint(row ? record : liveCopy(record), index);
        else if (gone.has(id)) { dialog._cxPaint(dialog._cxRecord, null); this.liveNote(this.labels.gridLiveRecordRemoved); }
        // A record whose position is not known (outside the result, or a hosted row not loaded) keeps its values and loses its neighbours.
        else if (shifted && !changed.has(id)) dialog._cxPaint(dialog._cxRecord, index >= 0 ? index : null);
      }
      this.liveFlash(changed);
    },
    /**
     * A projected view (groups, summaries, detail rows) runs its query again and restores the reader's place. The work of
     * the accepted result (the open drawer above all) stays bound to its lifetime until the next query of the reader.
     */
    async liveRequery(changed, removed, ownerSignal) {
      const anchor = this.liveAnchor(), active = document.activeElement, hadFocus = this.canvas.contains(active);
      const focusedId = this.focused && !this.focused.status ? this.focused.key : null, keep = this.dataLifetime;
      this.dataLifetime = new AbortController();
      // The grouping part keeps the summary of a query and revision; inline rows changed under the same revision.
      this.summaryCandidate = null;
      let queryLifetime;
      const cancel = () => queryLifetime?.abort();
      try {
        const query = this.setQuery({ ...this.acceptedQuery, offset: this.paged ? this.pageOffset : 0, revision: undefined });
        queryLifetime = this.dataLifetime;
        ownerSignal?.addEventListener("abort", cancel, { once: true });
        if (ownerSignal?.aborted) cancel();
        await query;
      }
      finally {
        ownerSignal?.removeEventListener("abort", cancel);
        const current = this.dataLifetime;
        if (current.signal.aborted || this.destroyed) keep.abort(); else current.signal.addEventListener("abort", () => keep.abort(), { once: true });
      }
      this.setLogicalTop(Math.min(anchor.top, this.total)); this.render();
      for (let wait = 0; wait < 8 && this.pendingPages.size && !this.destroyed; wait++) await Promise.race([...this.pendingPages.values()].map(token => token.promise));
      const focus = focusedId && [...this.rowCache.values()].find(row => row.key === focusedId);
      if (focus) this.focused = focus;
      if (hadFocus && !this.canvas.contains(document.activeElement)) (focus && this.rendered.get(focus) || this.grid).focus({ preventScroll: true });
      const dialog = this.recordDrawer, id = dialog?.isConnected ? dialog.getAttribute("data-cx-record") : null, row = id && [...this.rowCache.values()].find(item => item.key === id);
      if (row && changed.has(id)) dialog._cxPaint(row.h, row._ri);
      else if (id && new Set(removed).has(id)) { dialog._cxPaint(dialog._cxRecord, null); this.liveNote(this.labels.gridLiveRecordRemoved); }
      if (dialog?.contains(active) && !dialog.contains(document.activeElement)) active.focus?.({ preventScroll: true });
      this.liveAfterChange(changed, removed, () => -1, false);
    }
  });
