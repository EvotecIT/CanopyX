  // Facet validation belongs to the core so optional editing and reporting share the same response boundary.
  const reportingFacetKey = gridFacetKey;
  const reportingFacetPage = (input, grid, request) => validateGridFacetPage(input, grid.view, request, grid.snapshot);
  const reportingFacetProjection = (query, column) => gridColumnProjection(query, column);
  const FACET_INLINE_SOURCE = inlineGridSource;
  inlineGridSource = view => {
    const source = FACET_INLINE_SOURCE(view);
    if (!view.reporting?.facetColumns?.length) return source;
    const columns = new Map(view.columns.map(column => [column.id, column]));
    source.facet = (request, options) => {
      if (options.signal.aborted) throw new DOMException("Facet request cancelled.", "AbortError");
      const column = view.columns.find(item => item.id === request.column), query = request.includeCurrentFilter ? request.query :
        reportingFacetProjection(request.query, column.id);
      // Facet counts need the complete filtered projection, without sorting that projection.
      const rows = gridQueryRows(view, query, columns, false), buckets = new Map(), needle = foldText(request.search);
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
