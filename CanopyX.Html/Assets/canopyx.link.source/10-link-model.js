  // ---------- link part: external filters and highlights that other views apply (docs/linked-views.md) ----------
  // Loaded by the core (87-link.js) when a host calls a link method or creates a view with linkEvents. The same code serves
  // trees and flat grids: a flat grid puts external filters into its query (so a host source filters them too), a tree
  // matches them against its loaded nodes. linkFilters is what the host asked for; linkCommitted is what the view shows.
  const { TreeGrid, DataGrid } = LINK_IMPL;
  const LINK_SOURCE = /^[A-Za-z0-9][\w.:-]{0,127}$/, LINK_MAX_KEYS = 10000, LINK_MAX_VALUES = 1000;
  const linkText = (value, name, max) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/\S/.test(value) || value.length > max) throw new Error("CanopyX: link " + name + " must be visible text of at most " + max + " characters.");
    return value;
  };
  const linkIsoDate = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

  /** A declared column a link names, by id. */
  function linkColumn(grid, field) {
    const column = grid.view.columns.find(item => item.id === field);
    if (!column) throw new Error("CanopyX: a link names the undeclared column '" + field + "'.");
    return column;
  }

  /** One raw operand for a column of a kind: numbers for number columns, ISO dates with a zone for date columns. */
  function linkOperand(column, value) {
    if (value === null || value === undefined || typeof value === "object") throw new Error("CanopyX: link values are non-null raw values.");
    if (column.kind === "number") {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number) || typeof value === "boolean" || value === "" || Math.abs(number) > Number.MAX_SAFE_INTEGER) throw new Error("CanopyX: the column '" + column.id + "' links by numbers.");
      return number;
    }
    if (column.kind === "datetime" && !linkIsoDate(value)) throw new Error("CanopyX: the column '" + column.id + "' links by ISO dates with a time zone.");
    return typeof value === "boolean" || column.kind === "datetime" ? value : String(value);
  }

  /** Validates one external filter: { field, values } or { field, range: [from, to] }, with optional label, sourceLabel and persist. */
  function linkFilter(grid, source, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("CanopyX: an external filter is an object.");
    const column = linkColumn(grid, input.field), filter = { source, field: column.id };
    if ((input.values === undefined) === (input.range === undefined)) throw new Error("CanopyX: an external filter has values or a range.");
    if (input.values !== undefined) {
      if (!Array.isArray(input.values) || !input.values.length || input.values.length > LINK_MAX_VALUES) throw new Error("CanopyX: an external filter has 1 to " + LINK_MAX_VALUES + " values.");
      filter.values = Array.from(new Set(input.values.map(value => linkOperand(column, value))));
    } else {
      const range = input.range;
      if (!Array.isArray(range) || range.length !== 2 || range[0] == null && range[1] == null || column.kind === "text") throw new Error("CanopyX: a range is [from, to] on a number or date column.");
      filter.range = range.map(value => value == null ? null : linkOperand(column, value));
    }
    filter.label = linkText(input.label, "label", 256);
    filter.sourceLabel = linkText(input.sourceLabel, "source label", 128) || source;
    filter.persist = input.persist === true;
    return filter;
  }

  /** What a chip says about a filter's values: its label, or the values (and ranges) themselves, shortened past three. */
  function linkValuesText(grid, filter) {
    if (filter.label) return filter.label;
    const shown = filter.values ? filter.values.slice(0, 3).map(String) : [filter.range.map(value => value == null ? "…" : String(value)).join(" – ")];
    return shown.join(", ") + (filter.values && filter.values.length > 3 ? " +" + numberFormat(grid.lang).format(filter.values.length - 3) : "");
  }

  /** The keys or values a node or row has in a column: the label of a tree's first column, the cell value otherwise. */
  function linkCell(grid, record, field) {
    return grid.kind === "tree" && field === grid.view.columns[0].id && !Object.hasOwn(record.cells || {}, field) ? record.label : cellValue((record.cells || {})[field]);
  }

  /** Whether a record matches every external filter; dates compare by instant, everything else by its raw value. */
  function linkMatches(grid, record) {
    return grid.linkFilters.every(filter => {
      const value = linkCell(grid, record, filter.field), date = linkColumn(grid, filter.field).kind === "datetime";
      if (value == null) return false;
      const at = item => date ? Date.parse(item) : item, key = at(value);
      if (filter.values) return filter.values.some(item => at(item) === key || String(item) === String(value));
      return (filter.range[0] == null || key >= at(filter.range[0])) && (filter.range[1] == null || key <= at(filter.range[1]));
    });
  }

  const LINK_COMMON = {
    /** Replaces the external filters of one source; null or an empty array removes them. Resolves once the view shows the result. */
    setExternalFilter(source, filter) { return this.linkSet(source, filter, "api"); },

    /** Removes every external filter, or those of one source. */
    clearExternalFilters(source) { return source === undefined ? this.linkApply([], "api") : this.linkSet(source, null, "api"); },

    linkSet(source, filter, reason) {
      if (typeof source !== "string" || !LINK_SOURCE.test(source)) throw new Error("CanopyX: a link source is 1 to 128 letters, digits, '.', ':', '_' or '-'.");
      const list = filter == null ? [] : (Array.isArray(filter) ? filter : [filter]).map(item => linkFilter(this, source, item));
      if (list.length > 8) throw new Error("CanopyX: one source applies at most 8 external filters.");
      const next = (this.linkFilters || []).filter(item => item.source !== source).concat(list);
      if (next.length > 32) throw new Error("CanopyX: a view takes at most 32 external filters.");
      return this.linkApply(next, reason);
    },

    /** Applies the filters the host asked for; the view commits them once they show (linkCommit, per view kind). */
    async linkApply(next, reason) {
      if (this.destroyed) return false;
      if (JSON.stringify(next) === JSON.stringify(this.linkFilters || [])) return this.linkPending || true;
      const pending = this.linkCommit(next, reason);
      this.linkPending = pending;
      try { return await pending; } finally { if (this.linkPending === pending) this.linkPending = null; }
    },

    /** The view shows new external filters: tell the host (canopyx:externalfilter) and the screen reader. */
    linkChanged(reason) {
      const committed = this.linkCommitted || [], last = committed[committed.length - 1], count = this.linkCount();
      this.emit("externalfilter", { filters: this.getExternalFilters(), reason: reason || "api" });
      setText(this.live, !last ? this.labels.linkCleared : count == null ? fill(this.labels.linkFilteredBy, { source: last.sourceLabel, values: linkValuesText(this, last) }) :
        fill(this.labels.linkFiltered, { source: last.sourceLabel, count: numberFormat(this.lang).format(count) }));
    },

    /** One removable chip per source: "Filtered by Sites: Berlin ×". */
    linkChip(source, run) {
      const filters = this.linkCommitted.filter(item => item.source === source), first = filters[0];
      const values = filters.map(item => linkValuesText(this, item)).join("; ");
      const button = h("button", "cx-button cx-link-chip" + (this.kind === "grid" ? " cx-grid-chip" : ""));
      button.type = "button"; setText(button, fill(this.labels.linkFilteredBy, { source: first.sourceLabel, values }) + " ×");
      button.title = button.textContent.slice(0, -2);
      button.setAttribute("aria-label", fill(this.labels.linkRemoveFilter, { source: first.sourceLabel, values }));
      button.setAttribute("data-cx-condition", "link-" + source); button.setAttribute("data-cx-link-source", source);
      button.onclick = () => { button.focus({ preventScroll: true }); run(); };
      return button;
    },

    linkSources() { return Array.from(new Set((this.linkCommitted || []).map(item => item.source))); },

    linkRemove(source) {
      try { this.linkSet(source, null, "user").catch(error => { if (!error || error.name !== "AbortError") this.emit("error", { error }); }); }
      catch (error) { this.emit("error", { error }); }
    }
  };
  Object.assign(TreeGrid.prototype, LINK_COMMON);
  if (DataGrid) Object.assign(DataGrid.prototype, LINK_COMMON);
