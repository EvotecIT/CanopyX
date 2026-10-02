
  // ---------- tree grid: behavior ----------
  Object.assign(TreeGrid.prototype, {
    /** Opens or closes a node, judged by what the user sees: a filter can show a node open that was never expanded. */
    async toggle(w, expand, automatic = false) {
      if (this.destroyed || !w || w._invalidated || w.status || !this.expandable(w)) {
        return;
      }
      if ((this.restoring || this.initializing || this.replayingToggles) && !automatic) {
        const pending = this.pendingRestorationToggles || (this.pendingRestorationToggles = new Map());
        const last = pending.has(w) ? pending.get(w) : !!w._open;
        pending.set(w, expand === undefined ? !last : expand);
        return;
      }
      const open = !!w._open;
      const want = expand === undefined ? !open : expand;
      if (want === open && (!want || w.children)) {
        return;
      }
      w.expanded = want;
      const revision = w.toggleRevision = (w.toggleRevision || 0) + 1;
      w.filterCollapsed = !want && !!this.filter;
      try {
        if (want && !w.children) {
          await this.loadPage(w, null);
        } else {
          this.relayout();
          if (want) await this.expandInitial(w);
        }
      } finally {
        // A host load callback may throw after the page was applied; its expansion still belongs in saved state.
        if (!this.destroyed && !w._invalidated && w.toggleRevision === revision) this.stateChanged();
      }
      if (this.destroyed || w._invalidated || w.toggleRevision !== revision) return;
      this.emit("toggle", { node: w.h, expanded: w.expanded });
      if (this.opts.onToggle) {
        this.opts.onToggle(w.h, w.expanded);
      }
    },

    /** Loads the first page (cursor null) or the next page of a node's children, or of the top level. */
    loadPage(w, cursor) {
      if (this.destroyed || w._invalidated) return Promise.resolve();
      if (w.loading) {
        return w._pending;
      }
      w.loading = true;
      w.error = null;
      this.relayout();
      const started = performance.now();
      const restoration = this.restoreGeneration || 0;
      const suppressInitial = !!this.restoring;
      const token = w.pageToken = {};
      const controller = w.pageController = new AbortController();
      const generation = w.dataGeneration || 0;
      const obsolete = () => this.destroyed || w._invalidated || w.pageToken !== token || generation !== (w.dataGeneration || 0);
      const run = (async () => {
        let info = null;
        let appliedCount = null;
        let removedSelection = null;
        let removed = false;
        try {
          const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
          const page = inlineItems ? this.inlinePage(w, cursor) : await this.source.page(w === this.root ? null : w.h, cursor, { signal: controller.signal });
          if (obsolete()) return;
          const existing = inlineItems ? new Map(this.keyMap) : this.keyMap;
          if (inlineItems) for (const key of this.descendants(w).keys()) existing.delete(key);
          const items = validatePage(page, existing, cursor ? (w.children || []).length : 0);
          if (cursor != null && !items.length && page.next === cursor) {
            throw new Error("CanopyX: page continuation did not advance.");
          }
          if (inlineItems) {
            const prefix = cursor ? w.children || [] : [];
            const combined = prefix.map(child => child.h).concat(items);
            validateNodes(combined, existing, this.root.inlineItems != null);
            this.reconcileList(w, combined, page.total, page.next || null, prefix.map(child => child.idx).concat(page.positions), true);
          } else {
            if (!cursor || !w.children) {
              w.children = [];
            }
            const base = w.children.length;
            const suppressExpansion = suppressInitial || restoration !== (this.restoreGeneration || 0);
            items.forEach((node, i) => w.children.push(this.wrap(node, w, base + i, suppressExpansion)));
            w.total = typeof page.total === "number" ? page.total : page.next ? null : w.children.length;
            w.next = page.next || null;
          }
          if (w !== this.root && !w.next && !w.children.length) {
            w.h.hasChildren = false;
            w.h.childCount = 0;
            w.expanded = false;
          }
          this.applySort(w, false);
          // Paging changes sibling metadata, not retained host cell content.
          appliedCount = items.length;
        } catch (err) {
          if (obsolete()) return;
          w.error = err && err.message ? err.message : String(err);
          this.emit("error", { node: w.h, message: w.error });
        } finally {
          controller.abort();
          if (w.pageToken !== token) return;
          w.pageToken = null;
          w.pageController = null;
          w.loading = false;
          w._pending = null;
          if (!this.destroyed && !w._invalidated && w.pendingChildCount != null) {
            const count = w.pendingChildCount;
            const loaded = w.children ? w.children.length : 0;
            w.total = count;
            if (w.children && (loaded > count || (!w.next && loaded < count))) {
              removedSelection = this.invalidateChildren(w);
              removed = true;
            } else if (loaded === count) {
              w.next = null;
              w.error = null;
            }
            if (!count && !loaded) w.expanded = false;
            w.pendingChildCount = null;
          }
          // Rows of removed nodes go at once, even while an opening path holds back the rest.
          if (!this.destroyed && !w._invalidated) this.relayout(removed);
        }
        // A newer count can discard an older page during reconciliation. Only announce and notify
        // the host after the page is known to remain attached to the tree.
        if (appliedCount != null && !this.destroyed && !w._invalidated && generation === (w.dataGeneration || 0) && w.children) {
          const loaded = w.children.length;
          const format = numberFormat(this.lang);
          this.announce(w.total != null && loaded < w.total ? fill(this.labels.pageLoaded, { loaded: format.format(loaded), total: format.format(w.total) }) : fill(this.labels.itemsLoaded, { count: format.format(loaded) }));
          info = { node: w.h, count: appliedCount, total: w.total, ms: performance.now() - started };
        }
        if (removedSelection) this.selectionChanged(removedSelection);
        // Host callback failures do not turn an applied page into a source failure.
        try {
          if (info && !this.destroyed && !w._invalidated) {
            this.emit("load", info);
            if (this.opts.onLoad) this.opts.onLoad(w.h, info);
          }
        } finally {
          if (!this.destroyed && !w._invalidated && !w.error && (w !== this.root || !this.initializing) && (w === this.root || w.expanded) && !suppressInitial && restoration === (this.restoreGeneration || 0)) await this.expandInitial(w);
        }
      })();
      w._pending = run;
      return run;
    },

    async loadMore(w) {
      if (w.children && w.next) {
        await this.loadStatusPage(w, this.statusRow(w, "more"), w.next);
      }
    },

    setFocus(w, domFocus) {
      if (!w) {
        return;
      }
      this.focusRevision = (this.focusRevision || 0) + 1;
      this.focused = w;
      this.ensureVisible(w);
      // Detail rows measured on the way can move the row out of view again.
      if (this.render()) {
        this.ensureVisible(w);
        this.render();
      }
      const rowEl = this.rendered.get(w);
      if (rowEl && domFocus !== false) {
        rowEl.focus({ preventScroll: true });
      }
      this.stateChanged();
    },

    ensureVisible(w) {
      const i = this.indexOf(w);
      if (i < 0) {
        return;
      }
      const grid = this.grid;
      const y = this.tops[i];
      const height = w.hpx;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const before = grid.scrollTop;
      if (y < before) {
        grid.scrollTop = y;
      } else if (y + height > before + viewHeight) {
        grid.scrollTop = y + height - viewHeight;
      }
      if (Math.abs(grid.scrollTop - before) > viewHeight) this.leanReveal();
    },

    /**
     * After a jump to a row far away, every row in view is new: until the frame that shows them is painted, the
     * rows around the viewport (the overscan) are left out, and they follow in the frame after.
     */
    leanReveal() {
      if (this.lean) return;
      this.lean = true;
      requestAnimationFrame(() => setTimeout(() => {
        this.lean = false;
        this.scheduleRender();
      }));
    },

    rowFromEvent(e) {
      const rowEl = e.target.closest(".cx-row");
      // A row can still show a node that a count update removed, until the rows are rebuilt.
      return rowEl && rowEl._w && !rowEl._w._invalidated ? rowEl._w : null;
    },

    onClick(e) {
      const w = this.rowFromEvent(e);
      if (!w) {
        return;
      }
      if (w.status) {
        this.setFocus(w, true);
        this.activate(w, true);
        return;
      }
      const interactive = hostControl(e.target);
      if (interactive && !e.target.closest(".cx-exp")) {
        this.setFocus(w, false);
        return;
      }
      if (w.h.detail) {
        this.setFocus(w, true);
        this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
        return;
      }
      this.setFocus(w, true);
      if (e.target.classList.contains("cx-exp")) {
        this.toggle(w);
      } else {
        this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
      }
    },

    onDblClick(e) {
      const w = this.rowFromEvent(e);
      if (w && !w.status && !hostControl(e.target)) {
        this.toggle(w);
      }
    },

    /** Sets a filter: a predicate over nodes, or { match, keep } for ancestor hints; null clears it. */
    setFilter(filter, options) {
      this.filter = typeof filter === "function" ? { match: filter } : filter || null;
      this.filterExpand = !!(options && options.autoExpand);
      this.keyMap.forEach((w) => { w.filterCollapsed = false; });
      this.relayout();
    },

    /** Turns a declarative flag filter from the view on or off; active filters must all match. */
    setFilterActive(id, active) {
      const next = new Set(this.activeFilters);
      if (active) next.add(id);
      else next.delete(id);
      this.applyActiveFilters([id], next);
    },

    /**
     * Makes exactly the given declared filters active, all at once: one row rebuild, and one canopyx:filter event with
     * the final set when it changed. An id the view does not declare is an error, and nothing changes.
     */
    setActiveFilters(ids) {
      if (!Array.isArray(ids)) throw new Error("CanopyX: setActiveFilters needs an array of filter ids.");
      this.applyActiveFilters(ids, new Set(ids));
    },

    applyActiveFilters(named, next) {
      const declared = this.view.filters || [];
      named.forEach((id) => {
        if (!declared.some((f) => f.id === id)) throw new Error("CanopyX: the view declares no filter '" + id + "'.");
      });
      const changed = next.size !== this.activeFilters.size || Array.from(next).some((id) => !this.activeFilters.has(id));
      // The same set again leaves the rows as they are (branches collapsed under the filter stay collapsed), unless
      // a predicate of the host's replaced the declared filters meanwhile.
      if (!changed && this.filter === this.declaredFilter) return;
      this.activeFilters = next;
      this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = next.has(input.getAttribute("data-cx-filter")); });
      const filters = declared.filter((f) => next.has(f.id));
      const has = (node, flag) => !!(flag && node.flags && node.flags.indexOf(flag) >= 0);
      this.setFilter(filters.length ? {
        match: (node) => filters.every((f) => has(node, f.flag)),
        keep: (node) => filters.every((f) => has(node, f.flag) || has(node, f.ancestorFlag))
      } : null, { autoExpand: true });
      this.declaredFilter = this.filter;
      // A host that draws its own control for a hidden filter keeps it in step through this event.
      if (changed) this.emit("filter", { active: Array.from(next) });
      this.stateChanged();
    },

    sort(columnId, direction) {
      this.sortState = direction ? { column: columnId, direction: direction } : null;
      this.inlineOrderVersion = (this.inlineOrderVersion || 0) + 1;
      this.buildHeader();
      this.applySort(this.root, true);
      this.relayout();
      this.stateChanged();
    },

    setColumnVisible(columnId, visible) {
      const index = this.columns.findIndex((c) => c.id === columnId);
      if (index <= 0) {
        return;
      }
      this.columns[index].hidden = !visible;
      const input = Array.from(this.toolbar.querySelectorAll("[data-cx-column]")).find((el) => el.getAttribute("data-cx-column") === columnId);
      if (input) {
        input.checked = !!visible;
      }
      this.buildHeader();
      this.relayout();
      this.stateChanged();
    }
  });
