  // ---------- tree grid: versioned view snapshots ----------
  function statePaths(value) {
    if (!Array.isArray(value)) throw new Error("CanopyX: state paths must be arrays.");
    return value.map(path => {
      if (!Array.isArray(path) || !path.length) throw new Error("CanopyX: state paths cannot be empty.");
      return path.map(id => { requireIdentifier(id, "state path ID"); return id; });
    });
  }

  Object.assign(TreeGrid.prototype, {
    getState() {
      const anchor = this.captureScrollAnchor(), anchorNode = anchor && this.keyMap.get(anchor.id);
      return { version: 1, expanded: this.getExpandedPaths(), selection: Array.from(this.selected, w => this.pathOf(w)),
        columns: this.columns.map(c => ({ id: c.id, width: c.width, hidden: !!c.hidden })),
        sort: this.sortState && Object.assign({}, this.sortState), filters: Array.from(this.activeFilters),
        timeZone: this.local ? "local" : "utc", pinTreeColumn: this.host.classList.contains("cx-pin-tree"),
        focus: this.focused && !this.focused.status && !this.focused._invalidated ? this.pathOf(this.focused) : null,
        anchor: anchorNode ? { path: this.pathOf(anchorNode), offset: anchor.offset } : null };
    },

    /** Validates the complete snapshot before changing the view; legacy expansion-only state is accepted. */
    readState(state) {
      if (!state || typeof state !== "object") return null;
      try {
        const result = { expanded: statePaths(state.expanded) };
        if (state.version === undefined) return result;
        if (state.version !== 1) return null;
        result.version = 1;
        result.selection = statePaths(state.selection);
        if (!this.multi && result.selection.length > 1) return null;
        if (!Array.isArray(state.columns) || !Array.isArray(state.filters)) return null;
        const seen = new Set();
        result.columns = state.columns.map(c => {
          requireIdentifier(c && c.id, "state column ID");
          if (seen.has(c.id) || !Number.isFinite(c.width) || c.width < 40 || c.width > MAX_COLUMN_WIDTH || typeof c.hidden !== "boolean")
            throw new Error("CanopyX: invalid state column.");
          seen.add(c.id);
          if (c.id === this.columns[0].id && c.hidden) throw new Error("CanopyX: the tree column remains visible.");
          return { id: c.id, width: c.width, hidden: c.hidden };
        });
        result.filters = state.filters.map(id => { requireIdentifier(id, "state filter ID"); return id; })
          .filter(id => (this.view.filters || []).some(f => f.id === id));
        result.sort = null;
        if (state.sort != null) {
          requireIdentifier(state.sort.column, "state sort column");
          if (state.sort.direction !== "asc" && state.sort.direction !== "desc") return null;
          if (this.columns.some(c => c.id === state.sort.column)) result.sort = { column: state.sort.column, direction: state.sort.direction };
        }
        if (state.timeZone !== "utc" && state.timeZone !== "local" || typeof state.pinTreeColumn !== "boolean") return null;
        result.timeZone = state.timeZone; result.pinTreeColumn = state.pinTreeColumn;
        result.focus = state.focus == null ? null : statePaths([state.focus])[0];
        result.anchor = null;
        if (state.anchor != null) {
          if (!Number.isFinite(state.anchor.offset) || state.anchor.offset < 0 || state.anchor.offset > MAX_PROTOCOL_INTEGER) return null;
          result.anchor = { path: statePaths([state.anchor.path])[0], offset: state.anchor.offset };
        }
        return result;
      } catch (error) { return null; }
    },

    applyStatePresentation(state) {
      if (!state.version) return;
      if (this.cancelResize) this.cancelResize();
      for (const saved of state.columns) {
        const column = this.columns.find(c => c.id === saved.id);
        if (column) { column.width = saved.width; column.hidden = saved.hidden; }
      }
      this.toolbar.querySelectorAll("[data-cx-column]").forEach(input => {
        const column = this.columns.find(c => c.id === input.getAttribute("data-cx-column"));
        if (column) input.checked = !column.hidden;
      });
      this.sortState = state.sort;
      this.inlineOrderVersion = (this.inlineOrderVersion || 0) + 1;
      this.setTreeColumnPinned(state.pinTreeColumn);
      this.setTimeZone(state.timeZone);
      this.buildHeader();
      this.applySort(this.root, true);
      this.setActiveFilters(state.filters);
    },

    /** Loads saved paths within restoration ownership, without selecting, revealing, or taking DOM focus. */
    async loadStatePaths(state, current) {
      const paths = state.selection.concat(state.focus ? [state.focus] : [], state.anchor ? [state.anchor.path] : []);
      const attached = new Set([state.focus, state.anchor && state.anchor.path].filter(Boolean).map(path => JSON.stringify(path)));
      for (const path of paths) {
        if (this.destroyed || current.signal.aborted) return;
        const existing = this.keyMap.get(path[path.length - 1]);
        let cached = false;
        for (let node = existing; node; node = node.parent) if (node._cached) cached = true;
        if (existing && JSON.stringify(this.pathOf(existing)) === JSON.stringify(path) &&
            (!attached.has(JSON.stringify(path)) || !cached)) continue;
        try { await this.expandPath(path, { select: false, focus: false, reveal: false, signal: current.signal }); }
        catch (error) { /* Nodes removed since the snapshot are skipped. */ }
      }
    },

    applyStatePosition(state, current) {
      if (!state.version) return;
      const valid = path => {
        const w = path && this.keyMap.get(path[path.length - 1]);
        return w && JSON.stringify(this.pathOf(w)) === JSON.stringify(path) ? w : null;
      };
      this.setSelection(state.selection.map(valid).filter(Boolean).map(w => w.key));
      if (this.destroyed || current.signal.aborted) return;
      const focused = valid(state.focus);
      if (focused && this.indexOf(focused) >= 0) this.setFocus(focused, false);
      const anchor = state.anchor && valid(state.anchor.path);
      if (anchor) this.restoreScrollAnchor({ id: anchor.key, offset: state.anchor.offset });
    }
  });
