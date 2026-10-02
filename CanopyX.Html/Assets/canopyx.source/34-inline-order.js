  // ---------- complete inline sibling order and bounded retained identities ----------
  Object.assign(TreeGrid.prototype, {
    modelChildren(w) {
      const children = w.children || [];
      return w.inlineCache && w.inlineCache.size ? children.concat(Array.from(w.inlineCache.values())) : children;
    },

    /** Sorts positions in the host's complete array, keeping only four bytes per sibling in the ordered index. */
    inlinePage(w, cursor, count, supplied) {
      const source = supplied || (w === this.root ? w.inlineItems : w.h.children);
      let order = w.inlineOrder;
      const version = this.inlineOrderVersion || 0, generation = w.dataGeneration || 0;
      if (!order || order.source !== source || order.version !== version || order.generation !== generation) {
        const indices = Uint32Array.from({ length: source.length }, (_, index) => index);
        const state = this.sortState, column = state && this.columns.find(c => c.id === state.column);
        if (column) {
          const columnIndex = this.columns.indexOf(column), direction = state.direction === "desc" ? -1 : 1;
          const keys = source.map(node => sortKey(this.cellOf(node, column, columnIndex), column));
          indices.sort((a, b) => compareKeys(keys[a], keys[b], direction) || a - b);
        }
        order = w.inlineOrder = { source, indices, version, generation };
      }
      const offset = cursor ? Number(cursor) : 0, end = Math.min(source.length, offset + (count || this.pageSize));
      const positions = Array.from(order.indices.subarray(offset, end));
      return { items: positions.map(index => source[index]), positions, total: source.length,
        offset, next: end < source.length ? String(end) : null };
    },

    /** Attaches the ordered prefix while retaining loaded siblings that still exist outside it. */
    inlineReplacement(owner, items, positions) {
      const source = owner === this.root ? owner.inlineItems : owner.h.children;
      const prior = new Map(this.modelChildren(owner).map(w => [w.key, w]));
      const attached = new Set(items.map(node => node.id)), cached = [], extraPositions = [];
      source.forEach((data, index) => {
        if (prior.has(data.id) && !attached.has(data.id)) { cached.push(data); extraPositions.push(index); }
      });
      return { items: items.concat(cached), positions: (positions || items.map((_, index) => index)).concat(extraPositions), attached: items.length };
    },

    retainInline(w, cached) {
      const retained = this.inlineRetained || (this.inlineRetained = new Map());
      w._cached = cached;
      if (cached) { retained.delete(w.key); retained.set(w.key, w); }
      else retained.delete(w.key);
    },

    /** Evicts unpinned cached subtrees; selections, expansion, focus, anchors, and active requests retain ownership. */
    trimInlineCache() {
      const retained = this.inlineRetained;
      if (!retained || !retained.size) return;
      const groups = [];
      let size = 0;
      for (const w of retained.values()) {
        if (w._invalidated || !w._cached) { retained.delete(w.key); continue; }
        // A cached ancestor accounts for its whole subtree, including any inner cached lists.
        let ancestor = w.parent;
        while (ancestor && !ancestor._cached) ancestor = ancestor.parent;
        if (ancestor) continue;
        const nodes = [w].concat(Array.from(this.descendants(w).values()));
        size += nodes.length; groups.push({ w, nodes });
      }
      for (const group of groups) {
        if (size <= this.retainedNodeLimit) break;
        if (group.nodes.some(w => this.selected.has(w) || w.expanded || this.focused === w || this.anchor === w || w.loading || w.reloadController)) continue;
        group.w.parent.inlineCache.delete(group.w.key);
        for (const w of group.nodes) {
          w._invalidated = true; this.retirePage(w); retained.delete(w.key);
          if (this.keyMap.get(w.key) === w) this.keyMap.delete(w.key);
          if (this.countRevisions) this.countRevisions.set(w.key, (this.countRevisions.get(w.key) || 0) + 1);
        }
        size -= group.nodes.length;
      }
    }
  });
