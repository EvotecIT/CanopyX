
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
      const run = (async () => {
        let info = null;
        let appliedCount = null;
        let removedSelection = null;
        try {
          const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
          const page = inlineItems ? slicePage(inlineItems, cursor, this.pageSize) : await this.source.page(w === this.root ? null : w.h, cursor);
          if (this.destroyed || w._invalidated) return;
          const items = validatePage(page, this.keyMap, cursor ? (w.children || []).length : 0);
          if (cursor != null && !items.length && page.next === cursor) {
            throw new Error("CanopyX: page continuation did not advance.");
          }
          if (!cursor || !w.children) {
            w.children = [];
          }
          const base = w.children.length;
          const suppressExpansion = suppressInitial || restoration !== (this.restoreGeneration || 0);
          items.forEach((node, i) => w.children.push(this.wrap(node, w, base + i, suppressExpansion)));
          w.total = typeof page.total === "number" ? page.total : page.next ? null : w.children.length;
          w.next = page.next || null;
          if (w !== this.root && !w.next && !w.children.length) {
            w.h.hasChildren = false;
            w.h.childCount = 0;
            w.expanded = false;
          }
          this.applySort(w, false);
          // Paging changes sibling metadata, not retained host cell content.
          appliedCount = items.length;
        } catch (err) {
          if (this.destroyed || w._invalidated) return;
          w.error = err && err.message ? err.message : String(err);
          this.emit("error", { node: w.h, message: w.error });
        } finally {
          w.loading = false;
          w._pending = null;
          if (!this.destroyed && !w._invalidated && w.pendingChildCount != null) {
            const count = w.pendingChildCount;
            const loaded = w.children ? w.children.length : 0;
            w.total = count;
            if (w.children && (loaded > count || (!w.next && loaded < count))) {
              removedSelection = this.invalidateChildren(w);
            } else if (loaded === count) {
              w.next = null;
              w.error = null;
            }
            if (!count && !loaded) w.expanded = false;
            w.pendingChildCount = null;
          }
          if (!this.destroyed && !w._invalidated) this.relayout();
        }
        // A newer count can discard an older page during reconciliation. Only announce and notify
        // the host after the page is known to remain attached to the tree.
        if (appliedCount != null && !this.destroyed && !w._invalidated && w.children) {
          const loaded = w.children.length;
          const format = numberFormat(this.lang);
          this.announce(w.total != null && loaded < w.total ? format.format(loaded) + " of " + format.format(w.total) + " loaded" : format.format(loaded) + " items");
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
      if (y < grid.scrollTop) {
        grid.scrollTop = y;
      } else if (y + height > grid.scrollTop + viewHeight) {
        grid.scrollTop = y + height - viewHeight;
      }
    },

    rowFromEvent(e) {
      const rowEl = e.target.closest(".cx-row");
      return rowEl && rowEl._w ? rowEl._w : null;
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

    /** Opens a node for expandPath and throws when its children cannot be loaded. */
    async openForPath(w) {
      if (this.destroyed || w._invalidated) return false;
      const wasOpen = w.expanded && !w.filterCollapsed;
      w.expanded = true;
      w.filterCollapsed = false;
      const revision = w.toggleRevision || 0;
      if (!w.children) {
        await this.loadPage(w, null);
        if (this.destroyed || w._invalidated || !w.expanded || (w.toggleRevision || 0) !== revision) return false;
        if (!w.children) {
          throw new Error("CanopyX: could not load the children of '" + w.key + "': " + (w.error || "no data"));
        }
      } else if (!wasOpen) {
        await this.expandInitial(w);
      }
      return !this.destroyed && !w._invalidated && w.expanded && (w.toggleRevision || 0) === revision;
    },

    /**
     * Expands the tree along an id path, paging through "show more" until each id is loaded. Options: select and
     * focus (default true), reveal (scroll to the node, default true), expandLast (also open the last node),
     * signal (AbortSignal; cancelled navigation returns null without selecting or focusing).
     */
    async expandPath(ids, options) {
      const o = options || {};
      const cancelled = () => this.destroyed || !!(o.signal && o.signal.aborted);
      if (cancelled()) return null;
      await this.rootsReady;
      if (cancelled()) return null;
      let parent = this.root;
      let w = null;
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        if (parent !== this.root) {
          try { if (!await this.openForPath(parent)) return null; }
          catch (err) { if (cancelled() || parent._invalidated) return null; throw err; }
          opened.push([parent, parent.toggleRevision || 0]);
        }
        if (cancelled() || parent._invalidated || (parent !== this.root && !parent.expanded)) return null;
        w = this.keyMap.get(ids[k]);
        const seenCursors = new Set();
        while ((!w || w.parent !== parent) && parent.children && parent.next) {
          const before = parent.children.length;
          const cursor = parent.next;
          if (seenCursors.has(cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': no progress (continuation repeated)");
          }
          seenCursors.add(cursor);
          await this.loadPage(parent, parent.next);
          if (cancelled() || parent._invalidated || (parent !== this.root && (!parent.expanded || (parent.toggleRevision || 0) !== opened[opened.length - 1][1]))) return null;
          if (parent.error || (parent.children.length === before && parent.next === cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': " + (parent.error || "no progress"));
          }
          w = this.keyMap.get(ids[k]);
        }
        if (!w || w.parent !== parent) {
          throw new Error("CanopyX: id not found on the path: " + ids[k]);
        }
        parent = w;
      }
      if (o.expandLast && w && this.expandable(w)) {
        try { if (!await this.openForPath(w)) return null; }
        catch (err) { if (cancelled() || w._invalidated) return null; throw err; }
        opened.push([w, w.toggleRevision || 0]);
      }
      if (cancelled() || (w && w._invalidated) || opened.some(([node, revision]) =>
        node._invalidated || !node.expanded || (node.toggleRevision || 0) !== revision)) return null;
      this.relayout();
      if (w && o.reveal !== false && this.filter && this.indexOf(w) < 0) {
        this.clearDeclaredFilters();
        this.setFilter(null);
      }
      this.relayout();
      this.stateChanged();
      if (w && o.select !== false) {
        this.select(w);
      }
      if (w && o.focus !== false) {
        this.setFocus(w, true);
      } else if (w && o.reveal !== false) {
        this.ensureVisible(w);
      }
      return w ? w.h : null;
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
      if (!(this.view.filters || []).some((f) => f.id === id)) {
        throw new Error("CanopyX: the view declares no filter '" + id + "'.");
      }
      const changed = this.activeFilters.has(id) !== !!active;
      if (active) {
        this.activeFilters.add(id);
      } else {
        this.activeFilters.delete(id);
      }
      const input = Array.from(this.toolbar.querySelectorAll("[data-cx-filter]")).find((el) => el.getAttribute("data-cx-filter") === id);
      if (input) {
        input.checked = !!active;
      }
      const filters = (this.view.filters || []).filter((f) => this.activeFilters.has(f.id));
      const has = (node, flag) => !!(flag && node.flags && node.flags.indexOf(flag) >= 0);
      this.setFilter(filters.length ? {
        match: (node) => filters.every((f) => has(node, f.flag)),
        keep: (node) => filters.every((f) => has(node, f.flag) || has(node, f.ancestorFlag))
      } : null, { autoExpand: true });
      // A host that draws its own control for a hidden filter keeps it in step through this event.
      if (changed) this.emit("filter", { active: Array.from(this.activeFilters) });
    },

    sort(columnId, direction) {
      this.sortState = direction ? { column: columnId, direction: direction } : null;
      this.buildHeader();
      this.applySort(this.root, true);
      this.relayout();
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
    }
  });
