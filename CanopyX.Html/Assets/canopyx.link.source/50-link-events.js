  // ---------- link part: a view's own selection and filters as neutral payloads ----------
  // With linkEvents, a view reports what another view can follow as canopyx:linkchange:
  //   { view, action: "select" | "filter" | "clear", scope: "select" | "filter", keys, values: { column: [raw values] }, label }
  // select: the reader's selection, its row keys and the distinct values of every column across the selected loaded rows;
  // filter: a flat grid's own eq and in conditions by column (the external filters other views applied are left out);
  // clear: the selection or the own conditions became empty. External filters and highlights never report, so views that
  // follow each other do not echo.
  const LINK_ROWS = 1000, LINK_COLUMN_VALUES = 100;
  /** Distinct values of each declared column across records, bounded per column. */
  function linkValues(grid, records) {
    const values = Object.create(null);
    for (const column of grid.view.columns) {
      const seen = new Set();
      for (const record of records) {
        const value = linkCell(grid, record, column.id);
        if (value != null && seen.size < LINK_COLUMN_VALUES) seen.add(value);
      }
      if (seen.size) values[column.id] = Array.from(seen);
    }
    return values;
  }
  /** A short label: the first column's text of up to three records and the count of the rest. */
  function linkLabel(grid, records) {
    const first = grid.view.columns[0].id, shown = records.slice(0, 3).map(record => linkCell(grid, record, first)).filter(value => value != null).map(String);
    return shown.join(", ") + (records.length > 3 ? " +" + numberFormat(grid.lang).format(records.length - 3) : "");
  }
  const LINK_EVENTS = {
    /** Starts reporting canopyx:linkchange after the view was created (linkEvents starts it with the view). */
    startLinkEvents() { this.linkWatch(); return Promise.resolve(); },
    /** Starts reporting canopyx:linkchange; once per view. */
    linkWatch() {
      if (this.linkWatching || this.destroyed) return;
      this.linkWatching = true;
      const signal = this.lifetime.signal;
      this.host.addEventListener("canopyx:select", event => this.linkSelected(event.detail || {}), { signal });
      if (this.kind === "grid") this.host.addEventListener("canopyx:query", () => this.linkQueried(), { signal });
    },
    linkSelected(detail) {
      // Selecting every matching record is a query, not a set of keys; it is not reported.
      if (detail.selection && detail.selection.kind === "query") return;
      const nodes = detail.nodes || [], keys = this.kind === "tree" ? nodes.slice(0, LINK_MAX_KEYS).map(node => node.id) : (detail.ids || []).slice(0, LINK_MAX_KEYS);
      const shape = JSON.stringify(keys);
      if (shape === (this.linkSelectShape || "[]")) return;
      this.linkSelectShape = shape;
      const records = this.kind === "tree" ? nodes.slice(0, LINK_ROWS) : this.linkRecords(keys);
      this.emit("linkchange", { view: this.view.id, action: keys.length ? "select" : "clear", scope: "select", keys, values: linkValues(this, records), label: linkLabel(this, records) });
    },
    linkQueried() {
      const query = this.queryForChange(), mine = [];
      const collect = group => {
        for (const filter of group.filters || []) if (filter.operator === "eq" || filter.operator === "in") mine.push(filter);
        for (const child of group.groups || []) collect(child);
      };
      collect({ filters: query.filters, groups: query.filterGroup ? [query.filterGroup] : [] });
      const shape = JSON.stringify(mine);
      if (shape === (this.linkOwnShape || "[]")) return;
      this.linkOwnShape = shape;
      const values = Object.create(null);
      for (const filter of mine) values[filter.column] = Array.from(new Set((values[filter.column] || []).concat(filter.values)));
      const label = Object.values(values).map(list => list.slice(0, 3).join(", ")).join("; ");
      this.emit("linkchange", { view: this.view.id, action: mine.length ? "filter" : "clear", scope: "filter", keys: [], values, label });
    }
  };
  Object.assign(TreeGrid.prototype, LINK_EVENTS);
  if (DataGrid) Object.assign(DataGrid.prototype, LINK_EVENTS, {
    /** The loaded rows of these keys, in key order; rows the grid has not loaded are left out. */
    linkRecords(ids) {
      const wanted = new Set(ids.slice(0, LINK_ROWS)), found = new Map();
      for (const row of this.rowCache.values()) if (wanted.has(row.key)) found.set(row.key, row.h);
      return ids.filter(id => found.has(id)).map(id => found.get(id));
    }
  });
