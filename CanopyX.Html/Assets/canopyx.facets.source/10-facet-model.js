  // ---------- facet panel: options, the reader's conditions per column, and counts ----------
  // Each facet is a column: a value list (text columns by default) or a range with a histogram (number and date columns).
  // Its counts come from the accepted query without that column's own conditions, so facets filter each other (cross
  // filtering) while a facet still shows every value it can switch to. Inline data counts every row; a hosted grid asks its
  // source's value lists (gridFacetQuery, the reporting runtime's getFacets) for the declared facet columns.
  const FACET_KEYS = new Set(["columns", "position", "open", "collapsible", "width", "label", "target"]);
  const FACET_COLUMN_KEYS = new Set(["column", "kind", "label", "limit", "bins", "sort", "collapsed"]);
  const FACET_VALUES = 200;

  /** The panel's options: the view's facets, then the host's facets option, checked against the declared columns. */
  function facetOptions(grid) {
    const read = value => {
      if (value === undefined) return {};
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !FACET_KEYS.has(key)))
        throw new Error("CanopyX: facets takes columns, position, open, collapsible, width, label and target.");
      return value;
    };
    const merged = { ...read(grid.view.facets), ...read(grid.opts.facets) }, columns = new Map(grid.view.columns.map(column => [column.id, column]));
    if (!Array.isArray(merged.columns) || !merged.columns.length || merged.columns.length > 24) throw new Error("CanopyX: facets need 1 to 24 columns.");
    const seen = new Set();
    const facets = merged.columns.map(entry => {
      const facet = typeof entry === "string" ? { column: entry } : entry;
      if (!facet || typeof facet !== "object" || Object.keys(facet).some(key => !FACET_COLUMN_KEYS.has(key)) || !columns.has(facet.column) || seen.has(facet.column) ||
          facet.kind !== undefined && !["list", "range"].includes(facet.kind) || facet.label !== undefined && (typeof facet.label !== "string" || !facet.label.trim() || facet.label.length > 256) ||
          facet.limit !== undefined && (!Number.isInteger(facet.limit) || facet.limit < 1 || facet.limit > FACET_VALUES) ||
          facet.bins !== undefined && (!Number.isInteger(facet.bins) || facet.bins < 2 || facet.bins > 60) || facet.sort !== undefined && !["count", "value"].includes(facet.sort) ||
          facet.collapsed !== undefined && typeof facet.collapsed !== "boolean")
        throw new Error("CanopyX: invalid or duplicate facet column " + (facet && facet.column));
      seen.add(facet.column);
      const column = columns.get(facet.column), kind = facet.kind || (column.kind === "text" ? "list" : "range");
      if (kind === "range" && column.kind === "text") throw new Error("CanopyX: range facets need number or date columns.");
      const order = kind === "list" ? facetDeclaredOrder(grid, column) : null;
      return { column: facet.column, def: column, kind, label: facet.label || column.title, limit: facet.limit || 8, bins: facet.bins || 16,
        sort: facet.sort || (kind === "list" && !order ? "count" : "value"), order, collapsed: !!facet.collapsed };
    });
    if (merged.position !== undefined && !["side", "top"].includes(merged.position) || ["open", "collapsible"].some(key => merged[key] !== undefined && typeof merged[key] !== "boolean") ||
        merged.width !== undefined && (!Number.isInteger(merged.width) || merged.width < 180 || merged.width > 480) ||
        merged.label !== undefined && (typeof merged.label !== "string" || !merged.label.trim() || merged.label.length > 256) ||
        merged.target !== undefined && !(merged.target instanceof HTMLElement))
      throw new Error("CanopyX: invalid facet panel options.");
    const hosted = grid.view.source.kind !== "inline" || !!grid.opts.source;
    if (hosted && typeof grid.getFacets !== "function") throw new Error("CanopyX: a hosted grid's facet panel needs the reporting runtime.");
    if (hosted && facets.some(facet => !grid.view.reporting?.facetColumns?.includes(facet.column)))
      throw new Error("CanopyX: a hosted grid's facets must be declared reporting facet columns.");
    return { facets, hosted, position: merged.position || "side", open: merged.open !== false, collapsible: merged.collapsible !== false,
      width: merged.width || 260, label: merged.label || null, target: merged.target || null };
  }

  /**
   * A column's declared value order, if it has one: its reporting category order, else the values its enum or state
   * presenter names, in the order it names them. A value list then lists by that order (values it does not name follow).
   */
  function facetDeclaredOrder(grid, column) {
    const presenter = column.presenter, values = grid.view.reporting?.ordering?.[column.id]?.categories ||
      (presenter && (presenter.kind === "enum" || presenter.kind === "state") && presenter.tones ? Object.keys(presenter.tones) : null);
    return values && values.length ? new Map(values.map((value, index) => [foldText(String(value)), index])) : null;
  }

  /**
   * What the reader chose for a facet's column, read from the query: a value list's values (null for the empty bucket), a
   * range's bounds, nothing, or custom for another condition (the filter builder's, a contains test) the facet cannot show.
   * Locked: the column is part of a condition group that also tests other columns, which the facet can neither show nor
   * replace without changing those columns' conditions, so its controls are disabled until that group changes.
   */
  function facetSelection(query, facet) {
    let clauses;
    try { ({ clauses } = gridColumnClauses(query, facet.column)); } catch (_) { return { custom: true, locked: true }; }
    if (!clauses.length) return { none: true };
    if (facet.kind === "list") {
      const listed = clause => ["in", "eq", "isNull"].includes(clause.operator) && !clause.groups;
      const items = clauses.length !== 1 ? null : clauses[0].groups ? clauses[0].operator === "or" && !clauses[0].groups.length && clauses[0].filters.every(listed) ? clauses[0].filters : null : listed(clauses[0]) ? clauses : null;
      return items ? { values: items.flatMap(clause => clause.operator === "isNull" ? [null] : clause.values) } : { custom: true };
    }
    let low = null, high = null, open = false;
    for (const clause of clauses) {
      if (clause.groups || clauses.length > 2) return { custom: true };
      if ((clause.operator === "ge" || clause.operator === "gt") && low === null) low = clause.values[0];
      else if ((clause.operator === "le" || clause.operator === "lt") && high === null) { high = clause.values[0]; if (clause.operator === "lt") open = true; }
      else return { custom: true };
    }
    return { low, high, open };
  }

  /**
   * The query with a facet's choice in place of its column's conditions: a value list's values, or a range's bounds (an
   * open high bound is exclusive). A locked column (see facetSelection) keeps the query as it is.
   */
  function facetQuery(query, facet, choice) {
    const predicate = (operator, values = []) => ({ column: facet.column, operator, values });
    try {
      if (facet.kind === "range") {
        const base = gridColumnClauses(query, facet.column).query;
        const bounds = [choice.low != null && predicate("ge", [choice.low]), choice.high != null && predicate(choice.open ? "lt" : "le", [choice.high])].filter(Boolean);
        return gridQueryStart(base, { filters: [...base.filters, ...bounds] });
      }
      const raw = choice.filter(value => value !== null), empty = raw.length < choice.length;
      const items = [raw.length && predicate("in", raw), empty && predicate("isNull")].filter(Boolean);
      return gridInstallColumnClause(query, facet.column, !items.length ? null : items.length === 1 ? items[0] : { operator: "or", filters: items, groups: [] });
    } catch (_) { return query; }
  }
  /** Whether two queries count the same rows: facets ignore sort, paging and the window. */
  const facetShape = query => query ? JSON.stringify([query.search, query.searchMode, query.filters, query.filterGroup, query.revision]) : "";
  /** A facet value's key, as value lists fold text. */
  const facetKey = (value, column) => value === null ? "null" : column.kind === "text" && typeof value === "string" ? "s:" + foldText(value) : typeof value + ":" + value;

  /** Counts of one facet from inline rows: buckets for a value list (every value; the list's search filters as it draws), numeric values for a range. */
  function facetInlineCounts(grid, facet, query) {
    const projection = gridColumnProjection(query, facet.column), columns = new Map(grid.view.columns.map(column => [column.id, column]));
    const rows = gridQueryRows(grid.view, projection, columns, false), column = facet.def;
    if (facet.kind === "range") {
      const values = [];
      for (const row of rows) { const value = gridScalar(row.cells[column.id], column); if (value !== null) values.push(value); }
      return { matched: rows.length, values, complete: true };
    }
    const buckets = new Map();
    for (const row of rows) {
      const raw = gridScalar(row.cells[column.id], column), value = column.kind === "datetime" && raw !== null ? new Date(raw).toISOString() : raw, key = facetKey(value, column);
      const bucket = buckets.get(key);
      if (bucket) bucket.count++; else buckets.set(key, { value, count: 1 });
    }
    const items = [...buckets.values()];
    return { matched: rows.length, items, totalValues: items.length, truncated: false };
  }

  /** Counts of one facet from a hosted grid's value lists (gridFacetQuery), bounded to 200 buckets. */
  async function facetHostedCounts(grid, facet, search, signal) {
    const page = await grid.getFacets(facet.column, { search: search || "", includeCurrentFilter: false, limit: FACET_VALUES, signal });
    const column = facet.def;
    if (facet.kind === "range")
      return { matched: page.matched, buckets: page.items.filter(item => item.value !== null).map(item => ({ value: gridScalar(item.value, column), count: item.count })), complete: !page.truncated };
    return { matched: page.matched, items: page.items.map(item => ({ value: item.value, count: item.count })), totalValues: page.totalValues, truncated: page.truncated };
  }
