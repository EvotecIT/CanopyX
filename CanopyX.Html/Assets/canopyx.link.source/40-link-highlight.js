  // ---------- link part: highlights mark rows without filtering them ----------
  // A highlighted row carries data-cx-linked, which the stylesheet tones with the info colour and a bar at its start. The
  // first highlighted row scrolls into view unless the host says not to: a loaded row at once, a local grid's row after
  // it reads where the row is in the accepted order, a loaded tree node after its branch opens.
  const linkMark = (grid, element, row) => setAttr(element, "data-cx-linked", row && !row.status && grid.linkHighlight && grid.linkHighlight.has(row.key) ? "true" : null);
  for (const View of [TreeGrid, DataGrid]) if (View) {
    const FILL = View.prototype.fillRow;
    View.prototype.fillRow = function (element, row) { FILL.call(this, element, row); linkMark(this, element, row); };
  }
  const LINK_HIGHLIGHT = {
    /** Marks the rows with these keys; options: { scroll (default true), source (who asked, for the announcement) }. Resolves with the number of keys. */
    async setHighlight(keys, options) {
      if (!Array.isArray(keys) || keys.length > LINK_MAX_KEYS || keys.some(key => typeof key !== "string" || !key.length))
        throw new Error("CanopyX: a highlight is an array of at most " + LINK_MAX_KEYS + " row keys.");
      options = options || {};
      const source = linkText(options.source, "source", 128);
      if (this.destroyed) return 0;
      const set = keys.length ? new Set(keys) : null;
      this.linkHighlight = set;
      for (const [row, element] of this.rendered) linkMark(this, element, row);
      this.host.classList.toggle("cx-has-linked", !!set);
      setText(this.live, set ? fill(source ? this.labels.linkHighlighted : this.labels.linkHighlightedRows, { count: numberFormat(this.lang).format(set.size), source }) : "");
      // Scrolling is a courtesy: a view that is loading, or a row it cannot reach, keeps the marks without it.
      if (set && options.scroll !== false) await this.linkReveal(set).catch(() => {});
      return set ? set.size : 0;
    },
    clearHighlight() { return this.setHighlight([]); }
  };
  Object.assign(TreeGrid.prototype, LINK_HIGHLIGHT, {
    async linkReveal(keys) {
      let first = null, at = Infinity;
      for (const key of keys) {
        const node = this.keyMap.get(key);
        if (!node) continue;
        const index = this.indexOf(node), order = index >= 0 ? index : Number.MAX_SAFE_INTEGER - 1;
        if (order < at) { first = node; at = order; }
      }
      // The reader's filter stays: a node it hides is opened to but not shown.
      if (!first || this.linkHighlight !== keys) return;
      await this.expandPath(this.pathOf(first), { select: false, focus: false, reveal: false });
      if (!this.destroyed && this.linkHighlight === keys && this.indexOf(first) >= 0) this.ensureVisible(first);
    }
  });
  if (DataGrid) Object.assign(DataGrid.prototype, LINK_HIGHLIGHT, {
    async linkReveal(keys) {
      if (this.pendingQuery || !this.acceptedQuery) return;
      const epoch = this.queryEpoch, lifetime = this.dataLifetime;
      const current = () => !this.destroyed && !lifetime.signal.aborted && epoch === this.queryEpoch && !this.pendingQuery && this.linkHighlight === keys;
      let index = -1;
      for (const row of this.rowCache.values()) if (keys.has(row.key) && (index < 0 || row._ri < index)) index = row._ri;
      // Local sources cache the complete accepted order. Read bounded windows until its first highlighted record;
      // a loaded candidate bounds the search, while a host source is never asked for rows it did not send.
      if (index !== 0 && this.view.source.kind === "inline" && (!this.opts.source || this.enhanceStore) && !this.view.reporting?.grouping && this.snapshot?.matched) {
        const query = this.acceptedQuery, end = index < 0 ? this.snapshot.matched : index;
        const top = this.logicalTop(), focused = this.focused, navigation = this.pendingNavigation;
        for (let offset = 0; offset < end && current();) {
          const page = await this.source.query({ ...query, offset, limit: Math.min(10000, end - offset) }, { signal: lifetime.signal });
          if (!current()) return;
          const found = page.items.findIndex(item => keys.has(item.id));
          if (found >= 0) { index = offset + found; break; }
          if (!page.items.length) break;
          offset += page.items.length;
        }
        // A later keyboard/API navigation or reader scroll owns the viewport while compact rows finish decoding.
        if (this.focused !== focused || this.pendingNavigation !== navigation || this.logicalTop() !== top) return;
      }
      if (index >= 0 && current()) await this.scrollToRow(index);
    }
  });
