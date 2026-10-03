  // ---------- host query and dataset snapshot contracts ----------
  function readQuery(grid, value) {
    if (!value || value.version !== 1 || !Array.isArray(value.filters) ||
        value.sort === undefined || typeof value !== "object") throw new Error("CanopyX: query needs version 1, sort, and filters.");
    let sort = null;
    if (value.sort !== null) {
      const state = value.sort, column = state && grid.columns.find(c => c.id === state.column && c.sortable);
      if (!column || state.direction !== "asc" && state.direction !== "desc") throw new Error("CanopyX: invalid query sort.");
      sort = Object.freeze({ column: column.id, direction: state.direction });
    }
    const named = new Set(value.filters);
    if (named.size !== value.filters.length || value.filters.some(id => !(grid.view.filters || []).some(f => f.id === id)))
      throw new Error("CanopyX: query filters must be unique declared IDs.");
    // A stable declaration order makes equivalent filter sets the same query.
    const filters = Object.freeze((grid.view.filters || []).filter(f => named.has(f.id)).map(f => f.id));
    return Object.freeze({ version: 1, sort, filters });
  }

  function snapshotRevision(value, expected) {
    requireIdentifier(value && value.revision, "dataset revision");
    if (expected != null && value.revision !== expected) throw new Error("CanopyX: dataset revision changed; reload the roots before continuing.");
    return value.revision;
  }

  Object.assign(TreeGrid.prototype, {
    getQuery() {
      return { version: 1, sort: this.sortState && Object.assign({}, this.sortState), filters: Array.from(this.activeFilters) };
    },

    sourceRequest(signal) {
      return this.queryAware ? { signal: signal || this.dataLifetime.signal, query: this.acceptedQuery, revision: this.datasetRevision } : { signal };
    },

    syncQueryControls() {
      this.toolbar.querySelectorAll("[data-cx-filter]").forEach(input => { input.checked = this.activeFilters.has(input.getAttribute("data-cx-filter")); });
    },

    querySortHeader(id) {
      const query = this.pendingQuery || this.acceptedQuery, state = query.sort && query.sort.column === id ? query.sort.direction : null;
      this.sort(id, state === "asc" ? "desc" : state === "desc" ? null : "asc").catch(() => {});
    }
  });
