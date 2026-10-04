  // ---------- bounded host windows; selection identities are independent of cached pages ----------
  Object.assign(DataGrid.prototype, {
    requestPage(query, signal) { return this.runGridHook(signal => this.source.query(query, { signal }), signal); },

    storePage(page) {
      const rows = page.items.map((item, i) => ({ key: item.id, h: item, _ri: page.offset + i, hpx: this.rowH }));
      const incoming = new Map(rows.map(row => [row.key, row._ri]));
      for (const cached of this.rowCache.values()) if (incoming.has(cached.key) && incoming.get(cached.key) !== cached._ri)
        throw new Error("CanopyX: a grid row ID occurs at different positions in one snapshot.");
      for (const row of rows) {
        const existing = this.rowCache.get(row._ri);
        if (existing && existing.key !== row.key) throw new Error("CanopyX: a grid position changed identity in one snapshot.");
      }
      const retained = rows.map(row => this.rowCache.get(row._ri) || row);
      let restoreFocus = false;
      for (const row of retained) {
        const placeholder = this.placeholders.get(row._ri);
        if (this.focused === placeholder) {
          const element = this.rendered.get(placeholder);
          restoreFocus = !!(element && element.contains(document.activeElement));
          this.focused = row;
        }
        this.placeholders.delete(row._ri); this.rowCache.set(row._ri, row);
      }
      this.pages.set(page.offset, { rows: retained, offset: page.offset }); this.version++;
      return restoreFocus;
    },

    trimPages() {
      if (!this.window || this.pages.size <= this.cachePageLimit) return;
      const center = (this.window.first + this.window.last) / 2;
      const removable = [...this.pages.values()].filter(page => page.rows && !page.rows.some(row =>
        row === this.focused || row._ri >= this.window.first && row._ri <= this.window.last));
      removable.sort((a, b) => Math.abs(b.offset - center) - Math.abs(a.offset - center));
      while (this.pages.size > this.cachePageLimit && removable.length) {
        const page = removable.shift(); this.pages.delete(page.offset);
        for (const row of page.rows) if (this.rowCache.get(row._ri) === row) this.rowCache.delete(row._ri);
      }
      // Failed pages are bounded too. A later explicit retry may request them again.
      for (const [offset, page] of this.pages) if (this.pages.size > this.cachePageLimit && page.error &&
          (offset + this.pageSize <= this.window.first || offset > this.window.last)) this.pages.delete(offset);
    },

    loadWindow() {
      if (this.cursor || !this.window || !this.snapshot || this.pendingQuery || this.destroyed) return;
      const offsets = new Set();
      const bounds = this.rowBounds();
      for (let index = Math.max(bounds.first, this.window.first); index <= Math.min(bounds.last, this.window.last); index++)
        if (!this.rowCache.has(index)) offsets.add(Math.floor(index / this.pageSize) * this.pageSize);
      if (this.focused?.status && this.focused._ri >= 0) offsets.add(Math.floor(this.focused._ri / this.pageSize) * this.pageSize);
      for (const offset of offsets) {
        if (this.pendingPages.size >= 4) break;
        if (!this.pendingPages.has(offset) && !(this.pages.get(offset) || {}).error) this.loadPage(offset);
      }
    },

    loadPage(offset) {
      if (this.pendingPages.has(offset)) return this.pendingPages.get(offset).promise;
      const { queryEpoch: epoch, dataLifetime: lifetime, snapshot } = this;
      const query = gridQuery(this.view, { ...this.acceptedQuery, offset, limit: this.pageSize, revision: snapshot.revision });
      const token = {}; this.pendingPages.set(offset, token);
      token.promise = this.requestPage(query, lifetime.signal).then(page => {
        if (this.destroyed || epoch !== this.queryEpoch || lifetime !== this.dataLifetime) return;
        const restoreFocus = this.storePage(validateGridPage(page, this.view, query, snapshot));
        if (restoreFocus) {
          this.render();
          const active = document.activeElement, element = this.rendered.get(this.focused);
          if (element && (!active || active === document.body)) element.focus({ preventScroll: true });
        } else this.scheduleRender();
      }).catch(error => {
        if (this.destroyed || epoch !== this.queryEpoch || lifetime !== this.dataLifetime || lifetime.signal.aborted) return;
        this.pages.set(offset, { error, offset }); this.version++;
        this.setNotice(fill(this.labels.loadError, { error: error.message }), true); this.emit("error", { error }); this.scheduleRender();
      }).finally(() => {
        if (this.pendingPages.get(offset) === token) { this.pendingPages.delete(offset); this.loadWindow(); }
      });
      return token.promise;
    },

    async waitForRow(index, epoch) {
      while (!this.destroyed && epoch === this.queryEpoch) {
        const row = this.rowItem(index);
        if (!row || row.status !== "loading") return row;
        const offset = Math.floor(index / this.pageSize) * this.pageSize, pending = this.pendingPages.get(offset);
        if (pending) await pending.promise;
        else if (this.pendingPages.size < 4) await this.loadPage(offset);
        else await Promise.race([...this.pendingPages.values()].map(token => token.promise));
      }
      throw new DOMException("Grid navigation was superseded.", "AbortError");
    },

    retry() {
      if (this.lastFailedQuery) return this.setQuery(this.lastFailedQuery, this.lastFailedPaging);
      for (const [offset, page] of this.pages) if (page.error) this.pages.delete(offset);
      this.version++; this.setNotice("", false); this.scheduleRender(); return Promise.resolve();
    }
  });
