  // ---------- revisioned full-query facets; no counts inferred from mounted or cached windows ----------
  function reportingFacetKey(value, column) {
    if (value !== null && typeof value === "object" || value === undefined) throw new Error("CanopyX: facet values are raw scalars.");
    const scalar = gridScalar(value, column);
    if (scalar === null) return "null";
    return column.kind === "datetime" ? "d:" + scalar : typeof scalar === "string" ? "s:" + foldText(scalar) :
      typeof scalar === "boolean" ? "b:" + scalar : "n:" + scalar;
  }

  function reportingFacetProjection(query, column) {
    const project = group => {
      if (!group) return undefined;
      const filters = group.filters.filter(filter => filter.column !== column), groups = group.groups.map(project);
      if (group.operator === "or" && (filters.length !== group.filters.length || groups.some(child => !child))) return undefined;
      const children = groups.filter(Boolean);
      return filters.length || children.length ? { operator: group.operator, filters, groups: children } : undefined;
    };
    return { ...query, filters: query.filters.filter(filter => filter.column !== column), filterGroup: project(query.filterGroup) };
  }

  function reportingFacetPage(input, grid, request) {
    checkDocument(input, "gridFacetPage");
    const column = grid.view.columns.find(item => item.id === request.column);
    if (input.view !== grid.view.id || input.revision !== request.query.revision || input.column !== request.column ||
        input.search !== request.search || input.includeCurrentFilter !== request.includeCurrentFilter ||
        !Number.isInteger(input.matched) || input.matched < 0 || input.matched > MAX_PROTOCOL_INTEGER ||
        !Number.isInteger(input.totalValues) || input.totalValues < 0 || input.totalValues > input.matched ||
        !Array.isArray(input.items) || input.items.length > request.limit || input.items.length > input.totalValues ||
        !input.items.length && input.totalValues > 0 || input.truncated !== (input.items.length < input.totalValues))
      throw new Error("CanopyX: facet response must match its accepted revision, projection and bounded counts.");
    const keys = new Set(); let occurrences = 0;
    const items = input.items.map(item => {
      if (!item || !Object.prototype.hasOwnProperty.call(item, "value") || !Number.isInteger(item.count) || item.count < 1 || item.count > input.matched)
        throw new Error("CanopyX: invalid facet value/count bucket.");
      const key = reportingFacetKey(item.value, column);
      if (keys.has(key)) throw new Error("CanopyX: duplicate typed facet bucket.");
      keys.add(key); occurrences += item.count;
      return { value: item.value, count: item.count };
    });
    if (occurrences > input.matched || !request.search && !input.truncated && occurrences !== input.matched)
      throw new Error("CanopyX: facet buckets contradict the matching row count.");
    return gridFreeze({ protocol: PROTOCOL, type: "gridFacetPage", view: input.view, revision: input.revision,
      column: input.column, search: input.search, includeCurrentFilter: input.includeCurrentFilter,
      matched: input.matched, totalValues: input.totalValues, truncated: input.truncated, items });
  }

  const FACET_INLINE_SOURCE = inlineGridSource;
  inlineGridSource = view => {
    const source = FACET_INLINE_SOURCE(view);
    if (!view.reporting?.facetColumns?.length) return source;
    const columns = new Map(view.columns.map(column => [column.id, column]));
    source.facet = (request, options) => {
      if (options.signal.aborted) throw new DOMException("Facet request cancelled.", "AbortError");
      const column = view.columns.find(item => item.id === request.column), query = request.includeCurrentFilter ? request.query :
        reportingFacetProjection(request.query, column.id);
      const rows = gridQueryRows(view, query, columns), buckets = new Map(), needle = foldText(request.search);
      for (const row of rows) {
        const scalar = gridScalar(row.cells[column.id], column), value = column.kind === "datetime" && scalar !== null ? new Date(scalar).toISOString() : scalar;
        const key = reportingFacetKey(value, column), existing = buckets.get(key);
        if (existing) {
          existing.count++;
          if (typeof value === "string" && value < existing.value) existing.value = value;
        } else buckets.set(key, { value, count: 1 });
      }
      const items = [...buckets.values()].filter(item => foldText(item.value).includes(needle));
      items.sort((a, b) => {
        if (a.value === null || b.value === null) return a.value === b.value ? 0 : a.value === null ? 1 : -1;
        if (column.kind !== "text") return gridOrder(gridScalar(a.value, column), gridScalar(b.value, column));
        if (typeof a.value !== typeof b.value) return typeof a.value === "boolean" ? -1 : 1;
        return gridOrder(typeof a.value === "string" ? foldText(a.value) : a.value, typeof b.value === "string" ? foldText(b.value) : b.value);
      });
      return { protocol: PROTOCOL, type: "gridFacetPage", view: view.id, revision: "inline", column: column.id,
        search: request.search, includeCurrentFilter: request.includeCurrentFilter, matched: rows.length,
        totalValues: items.length, truncated: items.length > request.limit, items: items.slice(0, request.limit) };
    };
    return source;
  };
