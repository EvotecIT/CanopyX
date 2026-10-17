  // ---------- live data: an inline grid's rows and the order its result shows ----------
  // The part keeps the rows by id and the result's order for the accepted query (its shape, the ids in order and their
  // positions). A change merges new rows into that order where the sort puts them and drops rows that stop matching, so
  // membership and counts are always exact. With the stable order (the default) a row whose sort keys change stays where it
  // is and the order is marked changed until the reader re-sorts; without it the row moves to its sorted place at once.
  // Pages of the accepted query are served from this order, so scrolling never mixes it with a freshly sorted one.
  const liveCopy = value => JSON.parse(JSON.stringify(value));

  function liveColumns(view) { return new Map(view.columns.map(column => [column.id, column])); }

  /** Orders two rows as the query does: its sort keys (with the view's text ordering policies), then the ids. */
  function liveComparer(grid, query) {
    const columns = liveColumns(grid.view), compare = GRID_REPORTING.compare?.(grid.view) || gridCompare;
    const sorts = query.sort.map(sort => [columns.get(sort.column), sort.direction]);
    return (a, b) => {
      for (const [column, direction] of sorts) { const result = compare(a, b, column, direction); if (result) return result; }
      return gridOrder(a.id, b.id);
    };
  }

  /** Whether one row matches the query's search and filters. */
  function liveMatcher(grid, query) {
    const columns = liveColumns(grid.view), unsorted = { ...query, sort: [] };
    const view = { columns: grid.view.columns, searchColumns: grid.view.searchColumns, rows: null };
    return row => { view.rows = [row]; return gridQueryRows(view, unsorted, columns, false).length === 1; };
  }

  function liveIndexOrder(order) { order.at = new Map(); order.ids.forEach((id, index) => order.at.set(id, index)); return order; }

  Object.assign(DataGrid.prototype, {
    /** The inline rows by id, rebuilt when another feature replaced the rows array. */
    liveRows() {
      if (this.liveRowsOf !== this.view.rows) {
        this.liveRowMap = new Map(); for (const row of this.view.rows) this.liveRowMap.set(row.id, row);
        this.liveRowsOf = this.view.rows;
      }
      return this.liveRowMap;
    },
    /** The order of the accepted query's result, computed from the rows when the query's shape changed. */
    liveOrderOf() {
      const query = this.acceptedQuery, shape = gridResultShape(query);
      if (this.liveOrder?.shape !== shape || this.liveOrderSource !== this.source) {
        const rows = gridQueryRows(this.view, query, liveColumns(this.view), GRID_REPORTING.compare?.(this.view) || gridCompare);
        this.liveOrder = liveIndexOrder({ shape, ids: rows.map(row => row.id), dirty: false }); this.liveOrderSource = this.source;
      }
      return this.liveOrder;
    },
    /**
     * Applies queued changes to the inline rows, and to the result's order when ordered (views whose rows are projected into
     * groups run their query again instead and keep no order); returns what changed.
     */
    liveApplyRows(queue, ordered) {
      const rows = this.liveRows(), query = this.acceptedQuery, stable = this.liveOpts.stableOrder;
      if (!ordered) this.liveOrder = null;
      const order = ordered ? this.liveOrderOf() : { at: new Map(), ids: [] };
      const matches = liveMatcher(this, query), compare = liveComparer(this, query);
      const result = { added: [], updated: [], removed: [], missing: [] }, changed = new Map(), leave = new Set(), enter = [], kept = [];
      for (const change of queue.values()) {
        const before = rows.get(change.id);
        if (change.kind === "remove") {
          if (!before) { result.missing.push(change.id); continue; }
          rows.delete(change.id); result.removed.push(change.id); if (order.at.has(change.id)) leave.add(change.id);
          continue;
        }
        if (change.kind === "update" && !before) { result.missing.push(change.id); continue; }
        const after = change.kind === "add" ? change.row : liveMerged(before, change.row);
        if (before && liveSameRow(before, after)) continue;
        rows.set(change.id, after); (before ? result.updated : result.added).push(change.id);
        changed.set(change.id, liveChangedColumns(before, after));
        if (!ordered) continue;
        const was = order.at.has(change.id), now = matches(after);
        if (was && !now) leave.add(change.id);
        else if (!was && now) enter.push(after);
        else if (was && now) { if (stable) kept.push(change.id); else { leave.add(change.id); enter.push(after); } }
      }
      if (!changed.size && !result.removed.length) return { result, changed };
      if (!ordered) { this.view.rows = this.liveRowsOf = [...rows.values()]; return { result, changed }; }
      // A kept row is out of order when it no longer sorts between its neighbours (rows leaving the result do not count).
      let dirty = order.dirty;
      const neighbour = (index, step) => { for (let at = index + step; at >= 0 && at < order.ids.length; at += step) if (!leave.has(order.ids[at])) return rows.get(order.ids[at]); return null; };
      for (const id of kept) {
        if (dirty) break;
        const index = order.at.get(id), row = rows.get(id), previous = neighbour(index, -1), next = neighbour(index, 1);
        dirty = !!(previous && compare(previous, row) > 0 || next && compare(row, next) > 0);
      }
      let ids = leave.size ? order.ids.filter(id => !leave.has(id)) : order.ids;
      if (enter.length) {
        enter.sort(compare);
        const merged = [];
        let i = 0, j = 0;
        while (i < ids.length && j < enter.length) merged.push(compare(rows.get(ids[i]), enter[j]) <= 0 ? ids[i++] : enter[j++].id);
        while (i < ids.length) merged.push(ids[i++]);
        while (j < enter.length) merged.push(enter[j++].id);
        ids = merged;
      }
      this.liveOrder = liveIndexOrder({ shape: order.shape, ids, dirty: stable && dirty });
      this.view.rows = this.liveRowsOf = [...rows.values()];
      return { result, changed };
    }
  });

  /** A row with an update merged in: cells by column (null clears one), and tone, className, fields and detail replaced. */
  function liveMerged(before, change) {
    const after = { ...before, cells: { ...before.cells } };
    // A clearing null stays explicit in the row object hosts receive, including required nullable typed cells.
    Object.assign(after.cells, change.cells || {});
    for (const name of ["tone", "className", "fields", "detail"]) if (change[name] !== undefined) { if (change[name] === null) delete after[name]; else after[name] = change[name]; }
    return after;
  }

  // Pages of the accepted query come from the kept order, so they agree with what the grid shows.
  const LIVE_REQUEST = DataGrid.prototype.requestPage;
  DataGrid.prototype.requestPage = function (query, signal) {
    const order = this.liveOrder;
    // Another feature that replaced the inline source (a saved edit) changed rows the order was made from.
    if (order && this.liveOrderSource !== this.source) this.liveOrder = null;
    if (!this.liveOrder || !this.liveInline() || gridResultShape(query) !== order.shape) return LIVE_REQUEST.call(this, query, signal);
    const rows = this.liveRows(), items = order.ids.slice(query.offset, query.offset + query.limit).map(id => rows.get(id));
    return Promise.resolve({ protocol: PROTOCOL, type: "gridPage", view: this.view.id, revision: query.revision || "inline",
      offset: query.offset, total: rows.size, matched: order.ids.length, items });
  };
