  // ---------- tree grid: transactional child-list reloads ----------
  Object.assign(TreeGrid.prototype, {
    /** Collects attached descendants without recursive walks. */
    descendants(parent) {
      const found = new Map(), pending = this.modelChildren(parent).slice();
      while (pending.length) {
        const w = pending.pop();
        found.set(w.key, w);
        for (const child of this.modelChildren(w)) pending.push(child);
      }
      return found;
    },

    /** Retires old requests without allowing their finalizers to change a newer list. */
    retirePage(w, reloadOwner, clearDeferred = true) {
      w.dataGeneration = (w.dataGeneration || 0) + 1;
      w.pageToken = null;
      if (w.pageController) w.pageController.abort();
      w.pageController = null;
      w._pending = null;
      w.loading = false;
      if (w.reloadController && w.reloadController !== reloadOwner) w.reloadController.abort();
      if (clearDeferred) w.pendingChildCount = null;
    },

    /** Replaces a validated list and reuses surviving identities, including host controls on unchanged rows. */
    reconcileList(parent, items, total, next, positions, ordering = false, suppressExpansion = false, resetLazy = false) {
      const old = this.descendants(parent), retained = new Set(), incoming = new Set();
      const pendingData = items.slice();
      while (pendingData.length) {
        const data = pendingData.pop(); incoming.add(data.id);
        for (const child of data.children || []) pendingData.push(child);
      }
      // Accepted replacement data retires counts; paging or ordering unchanged identities preserves their responses.
      if (!ordering) {
        for (const w of [parent, ...old.values()]) w.countRevision = (w.countRevision || 0) + 1;
      }
      const pending = [{ owner: parent, items, total, next, positions }];
      while (pending.length) {
        const entry = pending.pop(), owner = entry.owner;
        const replacement = owner.inline ? this.inlineReplacement(owner, entry.items, entry.positions) :
          { items: entry.items, positions: entry.positions, attached: entry.items.length };
        const children = replacement.items.map((data, index) => {
          const position = replacement.positions ? replacement.positions[index] : index;
          let w = old.get(data.id);
          const reused = !!w;
          if (!w) w = this.createWrapper(data, owner, position);
          else {
            w.parent = owner; w.idx = position; w.level = owner.level + 1;
            const content = nodeContent(data);
            if (w.content !== content) w._v = 0;
            w.h = data; w.content = content;
            w.hpx = data.detail ? this.detailHeight(data.detail) : this.rowH;
            w.auto = !!data.detail && !(data.detail.height > 0);
          }
          this.retainInline(w, index >= replacement.attached);
          retained.add(w);
          if (Array.isArray(data.children)) {
            const count = Math.max(this.pageSize, reused && w.children ? w.children.length : 0);
            this.retirePage(w); w.inline = true;
            const first = this.inlinePage(w, null, count);
            pending.push({ owner: w, items: first.items, total: first.total, next: first.next, positions: first.positions });
            if (!reused) w.expanded = !suppressExpansion && !this.restoring && !!data.expanded && first.items.length > 0;
          } else if (!data.hasChildren || data.detail) {
            this.retirePage(w); w.inline = false; w.children = null; w.inlineCache = null; w.next = null; w.total = null; w.expanded = false;
          } else {
            w.inline = false;
            // An ID moved into the new list cannot also remain in an old cached lazy subtree.
            const cached = this.descendants(w);
            const conflict = Array.from(cached.keys()).some(id => incoming.has(id));
            if (resetLazy || conflict || data.childCount != null && w.children &&
                (data.childCount < w.children.length || !w.next && data.childCount !== w.children.length)) {
              this.retirePage(w); w.children = null; w.inlineCache = null; w.next = null;
            } else {
              for (const child of cached.values()) { child.level = child.parent.level + 1; retained.add(child); }
            }
            w.total = data.childCount == null ? w.total : data.childCount;
            if (!reused || resetLazy) w.autoExpand = !suppressExpansion && !this.restoring && !!(data.expanded || resetLazy && w.expanded);
          }
          return w;
        });
        owner.children = children.slice(0, replacement.attached);
        owner.inlineCache = new Map(children.slice(replacement.attached).map(w => [w.key, w]));
        owner.total = entry.total; owner.next = entry.next;
        owner.error = null;
        if (owner !== this.root && !children.length && !entry.next) owner.expanded = false;
      }
      let removedSelection = null;
      for (const w of old.values()) {
        if (retained.has(w)) continue;
        const removed = this.retireWrapper(w);
        if (!removedSelection) removedSelection = removed;
      }
      if (!ordering) this.applySort(parent, true);
      for (const w of retained) this.rememberInactive(w);
      this.rememberInactive(parent);
      this.trimInlineCache();
      if (parent !== this.root && !parent.inline) {
        if (total != null) parent.h.childCount = total;
        parent.h.hasChildren = !!(parent.children.length || next || total > 0);
      }
      this.relayout(true);
      if (removedSelection) this.selectionChanged(null);
    },

    /** Rereads a list through its loaded range; cancellation and failed validation leave existing data attached. */
    async reload(id, options) {
      if (this.destroyed) return false;
      if (id == null && this.queryAware) return this.setQuery(this.acceptedQuery, Object.assign({}, options, { force: true }));
      const parent = id == null ? this.root : this.keyMap.get(id);
      if (!parent || parent._invalidated) throw new Error("CanopyX: reload needs a loaded parent ID, or null for roots.");
      if (parent !== this.root && !this.expandable(parent)) throw new Error("CanopyX: reload needs a node with children.");
      if (parent.reloadController) parent.reloadController.abort();
      const controller = parent.reloadController = new AbortController();
      const navigation = navigationScope(this, [controller.signal, options && options.signal]);
      // Keep accepted counts on the old list until the replacement succeeds; cancel only its page here.
      this.retirePage(parent, controller, false);
      const target = Math.max(this.pageSize, (parent.children || []).length);
      const started = performance.now();
      try {
        const old = this.descendants(parent), outside = new Map(this.keyMap);
        for (const key of old.keys()) outside.delete(key);
        const items = [], positions = [], seen = new Set();
        const inlineOnly = this.root.inlineItems != null;
        const isInline = parent === this.root ? inlineOnly : parent.inline;
        const inline = isInline ? parent === this.root ? this.view.roots : parent.h.children : null;
        if (isInline) validateNodes(inline, outside, inlineOnly);
        let cursor = null, total = null, next = null;
        do {
          if (navigation.cancelled() || parent._invalidated) return false;
          const page = isInline ? this.inlinePage(parent, cursor, this.pageSize, inline) :
            await navigation.wait(this.source.page(parent === this.root ? null : parent.h, cursor, this.sourceRequest(controller.signal)));
          if (navigation.cancelled() || parent._invalidated) return false;
          validatePage(page, outside, items.length);
          if (this.queryAware && !isInline) snapshotRevision(page, this.datasetRevision);
          const pending = page.items.slice();
          while (pending.length) {
            const node = pending.pop(); outside.set(node.id, true);
            for (const child of node.children || []) pending.push(child);
          }
          if (page.positions) positions.push(...page.positions);
          items.push(...page.items); total = page.total; next = page.next || null;
          if (next && (seen.has(next) || next === cursor)) throw new Error("CanopyX: reload continuation did not advance.");
          if (next) seen.add(next);
          cursor = next;
        } while (next && items.length < target);
        if (navigation.cancelled() || parent._invalidated) return false;
        // Other lists may have loaded while the snapshot was read. Validate against their current identities too.
        const current = new Map(this.keyMap);
        for (const key of this.descendants(parent).keys()) current.delete(key);
        validateNodes(isInline ? inline : items, current, inlineOnly);
        const anchor = this.captureScrollAnchor();
        // Paging could have restarted against the old cursor while this snapshot was being staged.
        this.retirePage(parent, controller);
        if (parent === this.root && inlineOnly) parent.inlineItems = inline;
        this.reconcileList(parent, items, total == null ? next ? null : items.length : total, next, isInline ? positions : null);
        this.restoreScrollAnchor(anchor);
        this.stateChanged();
        this.emit("reload", { node: parent.h, count: items.length, total: parent.total, ms: performance.now() - started });
        return true;
      } catch (error) {
        if (navigation.cancelled() || parent._invalidated) return false;
        this.emit("error", { node: parent.h, message: error.message || String(error) });
        throw error;
      } finally {
        navigation.dispose(); controller.abort();
        if (parent.reloadController === controller) parent.reloadController = null;
      }
    },

    captureScrollAnchor() {
      const top = this.logicalTop();
      const index = this.rowAt(top);
      const w = this.rows[Math.min(index, this.rows.length - 1)];
      return w && !w.status ? { id: w.key, offset: top - this.tops[this.indexOf(w)] } : null;
    },

    restoreScrollAnchor(anchor) {
      const w = anchor && this.keyMap.get(anchor.id), index = this.indexOf(w);
      if (index >= 0) this.setLogicalTop(Math.max(0, this.tops[index] + anchor.offset));
    }
  });
