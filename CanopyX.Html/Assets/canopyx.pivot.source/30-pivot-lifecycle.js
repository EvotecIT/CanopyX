  const PIVOT_RENDER_BASE = DataGrid.prototype.render, PIVOT_DESTROY_BASE = DataGrid.prototype.destroy;
  Object.assign(DataGrid.prototype, {
    async requestPivot(query, page, signal, restore, state) {
      const { query: accepted, definition } = pivotRequestOf(this, query, page.revision, state), key = JSON.stringify({ query: accepted, definition });
      if (this.pivotCandidate?.key === key) {
        if (restore) restore.pivotCandidate = this.pivotCandidate;
        return;
      }
      const request = { protocol: "canopyx/2", type: "gridPivotQuery", query: accepted, definition };
      const value = this.source.pivot ? await this.runGridHook(signal => this.source.pivot(request, { signal }), signal) : this.view.source.kind === "inline" ? pivotInline(this, definition, accepted) : null;
      gridOperationActive(this, signal);
      if (!value) throw new Error("CanopyX: hosted pivots need an explicit source.pivot hook.");
      const candidate = { key, query: accepted, result: pivotResult(this, definition, accepted, page, value) };
      if (restore) restore.pivotCandidate = candidate; else this.pivotCandidate = candidate;
    },
    render() {
      if (!pivotEnabledLocal(this) || !pivotIntent(this)?.active) {
        this.host.classList.remove("cx-pivot-active"); if (this.pivotPanel) this.pivotPanel.hidden = true;
        if (this.pivotOwnHeight) { this.host.style.maxHeight = this.pivotFlatMaxHeight; this.pivotOwnHeight = false; }
        return PIVOT_RENDER_BASE.call(this);
      }
      if (this.destroyed || !this.acceptedQuery || !this.pivotCandidate) return;
      const key = JSON.stringify(pivotRequestOf(this, this.acceptedQuery, this.snapshot.revision));
      if (key !== this.pivotCandidate.key) { if (this.pivotPanel) this.pivotPanel.hidden = true; return; }
      this.pivotResult = this.pivotCandidate.result;
      if (!this.pivotOwnHeight) {
        this.pivotFlatMaxHeight = this.host.style.maxHeight; this.pivotOwnHeight = true;
        if (this.fitInline !== undefined) this.host.style.maxHeight = this.fitInline;
      }
      this.host.classList.add("cx-pivot-active");
      if (!this.pivotPanel) {
        this.pivotPanel = h("section", "cx-pivot"); this.pivotPanel.setAttribute("aria-label", this.labels.gridPivot); this.grid.after(this.pivotPanel);
        this.pivotResize = new ResizeObserver(() => this.renderPivot()); this.pivotResize.observe(this.pivotPanel);
      }
      this.pivotPanel.hidden = false; this.renderPivot();
    },
    setPivotCollapsed(axis, key, collapsed) {
      const state = pivotIntent(this), nodes = axis === "rows" ? this.pivotResult?.rows : axis === "columns" ? this.pivotResult?.columns : null;
      if (!state?.active || !nodes?.some(node => node.key === key && node.parent && nodes.some(child => child.parent === key)) || typeof collapsed !== "boolean" || this.pendingQuery)
        throw new Error("CanopyX: choose an accepted pivot axis prefix and collapse intent.");
      const name = axis === "rows" ? "collapsedRows" : "collapsedColumns", keys = new Set(state[name]);
      if (collapsed) keys.add(key); else keys.delete(key); state[name] = [...keys];
      this.renderPivot(); this.noteViewPreferenceIntent?.(); this.stateChanged(); this.emit("pivotCollapse", { axis, key, collapsed });
    },
    async drillPivot(rowKey, columnKey) {
      const state = pivotIntent(this), result = this.pivotResult, row = result.rows.find(node => node.key === rowKey), column = result.columns.find(node => node.key === columnKey);
      if (!state?.active || !row || !column || this.pendingQuery) throw new Error("CanopyX: choose an accepted pivot intersection.");
      const filters = [];
      const add = (levels, paths, width, exclude = false) => { if (width) filters.push({ columns: levels.slice(0, width).map(level => ({ column: level.column, ...(level.bucket ? { bucket: level.bucket } : {}) })), values: paths, exclude }); };
      add(state.rows, [row.path], row.path.length);
      if (column.other && result.retainedColumns.length) add(state.columns, result.retainedColumns, state.columns.length, true);
      else if (!column.other) add(state.columns, [column.path], column.path.length);
      const previous = this.getQuery(), next = gridQueryStart(previous, { tupleFilters: [...(previous.tupleFilters || []), ...filters] });
      gridQuery(this.view, next); this.pivotDrill = { query: previous }; state.active = false;
      try { await this.setQuery(next); }
      catch (error) { state.active = true; this.pivotDrill = null; this.render(); throw error; }
      this.showPivotReturn(); this.stateChanged();
    },
    showPivotReturn() {
      if (!this.pivotDrill) return;
      if (!this.pivotReturn) { this.pivotReturn = h("div", "cx-pivot-return"); this.notice.before(this.pivotReturn); }
      this.pivotReturn.replaceChildren(gridButton(this.labels.gridPivotReturn, async () => {
        const previous = this.pivotDrill; if (!previous || this.pendingQuery) return;
        pivotIntent(this).active = true;
        try { await this.setQuery(gridQueryStart(previous.query, {})); this.pivotDrill = null; this.pivotReturn.remove(); this.pivotReturn = null; this.stateChanged(); }
        catch (error) { pivotIntent(this).active = false; this.render(); this.emit("error", { error }); }
      }));
    },
    destroy() { this.pivotResize?.disconnect(); this.pivotPanel?.remove(); this.pivotReturn?.remove(); return PIVOT_DESTROY_BASE.call(this); }
  });
  const pivotEnabledLocal = grid => !!grid.view.reporting?.pivot || !!grid.view.reporting?.pivotable;
