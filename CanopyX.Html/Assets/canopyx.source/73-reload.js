  // ---------- tree grid: transactional child-list reloads ----------
  Object.assign(TreeGrid.prototype, {
    /** Collects attached descendants without recursive walks. */
    descendants(parent) {
      const found = new Map(), pending = (parent.children || []).slice();
      while (pending.length) {
        const w = pending.pop();
        found.set(w.key, w);
        for (const child of w.children || []) pending.push(child);
      }
      return found;
    },

    /** Retires old requests without allowing their finalizers to change a newer list. */
    retirePage(w) {
      w.dataGeneration = (w.dataGeneration || 0) + 1;
      w.pageToken = null;
      if (w.pageController) w.pageController.abort();
      w.pageController = null;
      w._pending = null;
      w.loading = false;
    },

    /** Replaces a validated list and reuses surviving identities, including host controls on unchanged rows. */
    reconcileList(parent, items, total, next) {
      const old = this.descendants(parent), retained = new Set(), incoming = new Set();
      const pendingData = items.slice();
      while (pendingData.length) {
        const data = pendingData.pop(); incoming.add(data.id);
        for (const child of data.children || []) pendingData.push(child);
      }
      const pending = [{ owner: parent, items, total, next }];
      while (pending.length) {
        const entry = pending.pop(), owner = entry.owner;
        const children = entry.items.map((data, index) => {
          let w = old.get(data.id);
          const reused = !!w;
          if (!w) w = this.createWrapper(data, owner, index);
          else {
            w.parent = owner; w.idx = index; w.level = owner.level + 1;
            if (w.h !== data) { w.h = data; w._v = 0; }
            w.hpx = data.detail ? this.detailHeight(data.detail) : this.rowH;
            w.auto = !!data.detail && !(data.detail.height > 0);
          }
          retained.add(w);
          if (Array.isArray(data.children)) {
            const count = Math.max(this.pageSize, reused && w.children ? w.children.length : 0);
            const first = slicePage(data.children, null, count);
            this.retirePage(w); w.inline = true;
            pending.push({ owner: w, items: first.items, total: first.total, next: first.next });
            if (!reused) w.expanded = !!data.expanded && first.items.length > 0;
          } else if (!data.hasChildren || data.detail) {
            this.retirePage(w); w.inline = false; w.children = null; w.next = null; w.total = null; w.expanded = false;
          } else {
            w.inline = false;
            // An ID moved into the new list cannot also remain in an old cached lazy subtree.
            const cached = this.descendants(w);
            const conflict = Array.from(cached.keys()).some(id => incoming.has(id));
            if (conflict || data.childCount != null && w.children &&
                (data.childCount < w.children.length || !w.next && data.childCount !== w.children.length)) {
              this.retirePage(w); w.children = null; w.next = null;
            } else {
              for (const child of cached.values()) { child.level = child.parent.level + 1; retained.add(child); }
            }
            w.total = data.childCount == null ? w.total : data.childCount;
            if (!reused) w.autoExpand = !!data.expanded;
          }
          return w;
        });
        owner.children = children; owner.total = entry.total; owner.next = entry.next;
        owner.error = null;
        if (owner !== this.root && !children.length && !entry.next) owner.expanded = false;
      }
      let removedSelection = null;
      for (const w of old.values()) {
        if (retained.has(w)) continue;
        w._invalidated = true;
        this.retirePage(w);
        if (w.reloadController) w.reloadController.abort();
        if (this.keyMap.get(w.key) === w) this.keyMap.delete(w.key);
        if (this.selected.delete(w) && !removedSelection) removedSelection = w;
        if (this.anchor === w) this.anchor = null;
      }
      this.applySort(parent, true);
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
      const parent = id == null ? this.root : this.keyMap.get(id);
      if (!parent || parent._invalidated) throw new Error("CanopyX: reload needs a loaded parent ID, or null for roots.");
      if (parent !== this.root && !this.expandable(parent)) throw new Error("CanopyX: reload needs a node with children.");
      if (parent.reloadController) parent.reloadController.abort();
      const controller = parent.reloadController = new AbortController();
      const navigation = navigationScope(this, [controller.signal, options && options.signal]);
      this.retirePage(parent);
      const target = Math.max(this.pageSize, (parent.children || []).length);
      const started = performance.now();
      try {
        const old = this.descendants(parent), outside = new Map(this.keyMap);
        for (const key of old.keys()) outside.delete(key);
        const items = [], seen = new Set();
        let cursor = null, total = null, next = null;
        do {
          if (navigation.cancelled() || parent._invalidated) return false;
          const inline = parent === this.root ? parent.inlineItems : parent.inline ? parent.h.children : null;
          const page = inline ? slicePage(inline, cursor, this.pageSize) :
            await navigation.wait(this.source.page(parent === this.root ? null : parent.h, cursor, { signal: controller.signal }));
          if (navigation.cancelled() || parent._invalidated) return false;
          validatePage(page, outside, items.length);
          const pending = page.items.slice();
          while (pending.length) {
            const node = pending.pop(); outside.set(node.id, true);
            for (const child of node.children || []) pending.push(child);
          }
          items.push(...page.items); total = page.total; next = page.next || null;
          if (next && (seen.has(next) || next === cursor)) throw new Error("CanopyX: reload continuation did not advance.");
          if (next) seen.add(next);
          cursor = next;
        } while (next && items.length < target);
        if (navigation.cancelled() || parent._invalidated) return false;
        // Other lists may have loaded while the snapshot was read. Validate against their current identities too.
        const current = new Map(this.keyMap);
        for (const key of this.descendants(parent).keys()) current.delete(key);
        validateNodes(items, current);
        const anchor = this.captureScrollAnchor();
        this.reconcileList(parent, items, total == null ? next ? null : items.length : total, next);
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
      const index = this.rowAt(this.grid.scrollTop);
      const w = this.rows[Math.min(index, this.rows.length - 1)];
      return w && !w.status ? { id: w.key, offset: this.grid.scrollTop - this.tops[this.indexOf(w)] } : null;
    },

    restoreScrollAnchor(anchor) {
      const w = anchor && this.keyMap.get(anchor.id), index = this.indexOf(w);
      if (index >= 0) this.grid.scrollTop = Math.max(0, this.tops[index] + anchor.offset);
    }
  });
