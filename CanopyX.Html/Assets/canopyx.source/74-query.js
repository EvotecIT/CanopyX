  // ---------- atomic remote query replacement ----------
  Object.assign(TreeGrid.prototype, {
    /** Stages a new query; the accepted rows and controls remain usable until its snapshot has validated. */
    async setQuery(value, options, restoreOwner) {
      if (this.destroyed) return false;
      if (options && options.signal && options.signal.aborted) return false;
      if (!this.queryAware) throw new Error("CanopyX: this source does not support view queries.");
      const query = readQuery(this, value), force = !!(options && options.force);
      if (this.restoreController && this.restoreController !== restoreOwner) this.restoreController.abort();
      if (this.queryController) this.queryController.abort();
      if (!force && this.datasetRevision != null && JSON.stringify(query) === JSON.stringify(this.acceptedQuery)) {
        this.pendingQuery = null; this.syncQueryControls(); return true;
      }
      const controller = this.queryController = new AbortController();
      const navigation = navigationScope(this, [controller.signal, options && options.signal]);
      this.pendingQuery = query;
      const started = performance.now(), target = force ? Math.max(this.pageSize, (this.root.children || []).length) : 1;
      try {
        const items = [], seen = new Set(), existing = new Map();
        let cursor = null, next = null, total = null, revision = null;
        do {
          if (navigation.cancelled()) return false;
          const page = await navigation.wait(this.source.page(null, cursor, { signal: controller.signal, query, revision }));
          if (navigation.cancelled()) return false;
          validatePage(page, existing, items.length);
          revision = snapshotRevision(page, revision);
          for (const node of page.items) {
            const pending = [node];
            while (pending.length) { const data = pending.pop(); existing.set(data.id, true); for (const child of data.children || []) pending.push(child); }
          }
          items.push(...page.items); total = page.total; next = page.next || null;
          if (next && (next === cursor || seen.has(next))) throw new Error("CanopyX: query continuation did not advance.");
          if (next) seen.add(next);
          cursor = next;
        } while (next && items.length < target);
        if (navigation.cancelled()) return false;
        const anchor = force ? this.captureScrollAnchor() : null;
        const filtersChanged = JSON.stringify(query.filters) !== JSON.stringify(this.acceptedQuery.filters);
        this.applyQuerySnapshot(query, revision, items, total, next, anchor);
        if (navigation.cancelled()) return false;
        this.emit("query", { query: this.getQuery(), revision });
        if (filtersChanged && !navigation.cancelled()) this.emit("filter", { active: Array.from(this.activeFilters) });
        if (force && !navigation.cancelled()) this.emit("reload", { node: null, count: items.length, total: this.root.total, ms: performance.now() - started });
        if (!this.restoring && !navigation.cancelled()) await navigation.wait(this.expandInitial(this.root));
        return !navigation.cancelled();
      } catch (error) {
        if (navigation.cancelled()) return false;
        this.announce(fill(this.labels.queryFailed, { error: error.message || String(error) }));
        this.emit("error", { node: null, message: error.message || String(error) });
        throw error;
      } finally {
        navigation.dispose(); controller.abort();
        if (this.queryController === controller) {
          this.queryController = null; this.pendingQuery = null; this.syncQueryControls();
        }
      }
    },

    /** Commits one validated query snapshot synchronously before notifying its consumers. */
    applyQuerySnapshot(query, revision, items, total, next, anchor) {
      this.dataLifetime.abort(); this.dataLifetime = new AbortController();
      if (this.cancelSearch) this.cancelSearch();
      this.retirePage(this.root);
      for (const node of this.keyMap.values()) this.retirePage(node);
      if (this.inactiveCache) this.inactiveCache.clear();
      this.acceptedQuery = query; this.datasetRevision = revision;
      this.sortState = query.sort; this.activeFilters = new Set(query.filters);
      this.filter = null; this.declaredFilter = null;
      this.buildHeader(); this.syncQueryControls();
      // Old lazy lists belong to the old query even when their parent identity survives.
      this.reconcileList(this.root, items, total == null ? next ? null : items.length : total, next, null, false, !!this.restoring, true);
      this.rootsReady = Promise.resolve();
      if (anchor) this.restoreScrollAnchor(anchor); else this.setLogicalTop(0);
      const count = numberFormat(this.lang);
      this.announce(this.root.total != null && items.length < this.root.total ? fill(this.labels.pageLoaded, { loaded: count.format(items.length), total: count.format(this.root.total) }) :
        fill(this.labels.itemsLoaded, { count: count.format(items.length) }));
      this.stateChanged();
    }
  });
