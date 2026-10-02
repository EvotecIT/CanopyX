  // ---------- tree grid: iterative filtering, layout, and sorting ----------
  // How long an opening path may hold back the rows it changes before they show (the interaction budget).
  const LAYOUT_HOLD_MS = 250;

  Object.assign(TreeGrid.prototype, {
    /** 2 = the node matches (its subtree shows), 1 = kept as an ancestor of matches, 0 = hidden. */
    matchState(w) {
      const pending = [{ node: w, visited: false }];
      while (pending.length) {
        const entry = pending.pop();
        const node = entry.node;
        if (node._fm !== undefined) continue;
        if (entry.visited) {
          node._fm = (node.children || []).some((child) => child._fm > 0) ? 1 : 0;
          continue;
        }
        if (this.filter.match(node.h)) node._fm = 2;
        else if (this.filter.keep && this.filter.keep(node.h)) node._fm = 1;
        else {
          pending.push({ node, visited: true });
          for (const child of node.children || []) {
            if (child._fm === undefined) pending.push({ node: child, visited: false });
          }
        }
      }
      return w._fm;
    },

    /**
     * Rebuilds the visible rows from the model and schedules a render. While a path opens (holdLayout), the rebuild
     * waits for the end of the hold, so the levels the path loads are laid out and rendered once; now rebuilds anyway.
     */
    relayout(now) {
      if (this.destroyed) return;
      if (this.layoutHolds && !this.layoutLate && !now) {
        this.layoutDirty = true;
        return;
      }
      this.layoutDirty = false;
      const previousFocus = this.focused;
      const previousIndex = this.indexOf(previousFocus);
      const previousElement = this.rendered.get(previousFocus);
      const ownedFocus = previousElement && previousElement.contains(document.activeElement);
      const rows = [];
      const filter = this.filter;
      if (filter) {
        this.keyMap.forEach((w) => { w._fm = undefined; });
      }
      const pending = [{ parent: this.root, filtered: !!filter, index: 0, pos: 0 }];
      while (pending.length) {
        const frame = pending[pending.length - 1];
        const children = frame.parent.children || [];
        if (frame.index < children.length) {
          const w = children[frame.index++];
          const state = frame.filtered ? this.matchState(w) : 2;
          if (!state) continue;
          const filterChildren = frame.filtered && state === 1;
          w.pos = ++frame.pos;
          rows.push(w);
          const autoOpen = filterChildren && this.filterExpand && !w.filterCollapsed && w.children && w.children.length;
          w._open = !!((w.expanded && (w.children || w.loading || w.error)) || autoOpen);
          if (w._open) pending.push({ parent: w, filtered: filterChildren, index: 0, pos: 0 });
        } else {
          const parent = frame.parent;
          parent.visibleCount = frame.pos;
          parent.childrenFiltered = frame.filtered;
          // Unloaded matches remain reachable through their parent status row.
          if (parent.loading) rows.push(this.statusRow(parent, "loading"));
          else if (parent.error) rows.push(this.statusRow(parent, "error"));
          else if (parent.next) rows.push(this.statusRow(parent, "more"));
          pending.pop();
        }
      }
      this.rows = rows;
      this.retop();
      this.grid.setAttribute("aria-rowcount", rows.some((row) => row.status) ? "-1" : String(rows.length + 1));
      if (this.focused && this.indexOf(this.focused) < 0 && this.focused !== this.focusHandoff) {
        let target = this.focused.parent;
        while (target && this.indexOf(target) < 0) target = target.parent;
        target = target || rows[Math.min(Math.max(0, previousIndex), rows.length - 1)];
        this.focused = null;
        if (target) this.setFocus(target, !!ownedFocus);
        else if (ownedFocus) {
          this.grid.tabIndex = 0;
          this.grid.focus({ preventScroll: true });
        }
      }
      this.grid.tabIndex = rows.length ? -1 : 0;
      this.scheduleRender();
    },

    /**
     * Holds row rebuilds until the returned function is called (once per hold; holds nest); it returns whether the
     * rows were rebuilt then. The grid keeps showing the rows it showed, and code that reads the rows sees that state.
     * A hold that lasts longer than LAYOUT_HOLD_MS lets the rebuilds through, so a slow source still shows its loading rows.
     */
    holdLayout() {
      if (!this.layoutHolds) {
        this.layoutTimer = setTimeout(() => {
          this.layoutTimer = 0;
          this.layoutLate = true;
          this.flushLayout();
        }, LAYOUT_HOLD_MS);
      }
      this.layoutHolds = (this.layoutHolds || 0) + 1;
      let held = true;
      return () => {
        if (!held) return false;
        held = false;
        if (--this.layoutHolds) return false;
        clearTimeout(this.layoutTimer);
        this.layoutTimer = 0;
        this.layoutLate = false;
        return this.flushLayout();
      };
    },

    /** Rebuilds the rows now if a hold deferred a rebuild; returns whether it did. */
    flushLayout() {
      if (!this.layoutDirty) return false;
      this.relayout(true);
      return true;
    },

    /** Rebuilds the offset table from the row heights; hpx is a row's height in pixels. */
    retop() {
      const top = this.logicalTop();
      const rows = this.rows;
      const tops = new Array(rows.length + 1);
      let y = 0;
      for (let i = 0; i < rows.length; i++) {
        rows[i]._ri = i;
        tops[i] = y;
        y += rows[i].hpx;
      }
      tops[rows.length] = y;
      this.tops = tops;
      this.total = y;
      this.syncScrollRange(top);
    },

    applySort(parent, deep) {
      if (this.queryAware) return;
      const pending = [parent];
      while (pending.length) {
        const owner = pending.pop();
        let children = owner.children;
        if (!children) continue;
        if (owner.inline) {
          const first = this.inlinePage(owner, null, children.length || this.pageSize);
          if (first.items.some((node, index) => !children[index] || children[index].key !== node.id) || first.items.length !== children.length) {
            this.retirePage(owner);
            this.reconcileList(owner, first.items, first.total, first.next, first.positions, true);
            children = owner.children;
          }
        }
        const state = this.sortState;
        const column = state && this.columns.find((c) => c.id === state.column);
        if (column) {
          const direction = state.direction === "desc" ? -1 : 1;
          const index = this.columns.indexOf(column);
          const keys = new Map();
          const keyOf = (w) => {
            let key = keys.get(w);
            if (!key) {
              key = sortKey(this.cellOf(w.h, column, index), column);
              keys.set(w, key);
            }
            return key;
          };
          children.sort((a, b) => compareKeys(keyOf(a), keyOf(b), direction) || a.idx - b.idx);
        } else {
          children.sort((a, b) => a.idx - b.idx);
        }
        if (deep) {
          const all = this.modelChildren(owner);
          for (let i = all.length - 1; i >= 0; i--) pending.push(all[i]);
        }
      }
      this.trimInlineCache();
    }
  });
