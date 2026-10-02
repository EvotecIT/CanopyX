  // ---------- inactive collapsed subtree retention ----------
  Object.assign(TreeGrid.prototype, {
    cachePinned(w) {
      const focus = this.focused;
      const filter = this.filter;
      return w.expanded || w.autoExpand || w.loading || w.reloadController || this.selected.has(w) ||
        w === (focus && focus.status ? focus.parent : focus) || w === this.anchor ||
        this.pendingRestorationToggles && this.pendingRestorationToggles.has(w) ||
        filter && (filter.match(w.h) || filter.keep && filter.keep(w.h));
    },

    rememberInactive(w) {
      if (this.destroyed || w._invalidated) return;
      const cache = this.inactiveCache || (this.inactiveCache = new Set());
      cache.delete(w);
      if (w !== this.root && w.children && (w.children.length || w.inlineCache && w.inlineCache.size) && !w.expanded) cache.add(w);
      this.cacheDirty = true;
    },

    trimInactiveCache() {
      if (!this.cacheDirty || this.destroyed || this.initializing || this.restoring || this.replayingToggles || this.layoutHolds) return;
      this.cacheDirty = false;
      const cache = this.inactiveCache;
      if (!cache || !cache.size) return;
      const groups = [];
      let size = 0;
      for (const w of cache) {
        if (w._invalidated || !w.children || w.expanded) { cache.delete(w); continue; }
      }
      for (const w of cache) {
        let ancestor = w.parent;
        while (ancestor && !cache.has(ancestor)) ancestor = ancestor.parent;
        if (ancestor) continue;
        const nodes = Array.from(this.descendants(w).values());
        groups.push({ w, nodes }); size += nodes.length;
      }
      for (const { w, nodes } of groups) {
        if (size <= this.inactiveNodeLimit) break;
        if (w.loading || w.reloadController || nodes.some(node => this.cachePinned(node))) continue;
        this.invalidateChildren(w);
        cache.delete(w);
        for (const node of nodes) cache.delete(node);
        size -= nodes.length;
      }
    }
  });
