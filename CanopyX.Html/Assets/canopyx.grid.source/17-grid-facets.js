  // ---------- revisioned full-query facets; no counts inferred from mounted or cached windows ----------
  function gridFacetKey(value, column) {
    if (value !== null && typeof value === "object" || value === undefined) throw new Error("CanopyX: facet values are raw scalars.");
    const scalar = gridScalar(value, column);
    if (scalar === null) return "null";
    return column.kind === "datetime" ? "d:" + scalar : typeof scalar === "string" ? "s:" + (gridExactTokens(column) ? scalar : foldText(scalar)) :
      typeof scalar === "boolean" ? "b:" + scalar : "n:" + scalar;
  }
  function validateGridFacetPage(input, view, request, snapshot) {
    checkDocument(input, "gridFacetPage");
    const declared = view.columns.find(item => item.id === request.column), column = request.bucket ? { ...declared, kind: "number" } : declared;
    if (JSON.stringify(input.bucket) !== JSON.stringify(request.bucket) || input.view !== view.id || input.revision !== request.query.revision || input.column !== request.column ||
        input.search !== request.search || input.includeCurrentFilter !== request.includeCurrentFilter ||
        !Number.isInteger(input.matched) || input.matched < 0 || input.matched > MAX_PROTOCOL_INTEGER ||
        !Number.isInteger(input.totalValues) || input.totalValues < 0 || input.totalValues > input.matched ||
        !Array.isArray(input.items) || input.items.length > request.limit || input.items.length > input.totalValues ||
        !input.items.length && input.totalValues > 0 || input.truncated !== (input.items.length < input.totalValues))
      throw new Error("CanopyX: facet response must match its accepted revision, projection and bounded counts.");
    const widened = !request.includeCurrentFilter &&
      gridResultShape(gridColumnProjection(request.query, request.column)) !== gridResultShape(request.query);
    if (Number.isInteger(snapshot.total) && input.matched > snapshot.total || Number.isInteger(snapshot.matched) &&
        (widened ? input.matched < snapshot.matched : input.matched !== snapshot.matched))
      throw new Error("CanopyX: facet counts contradict the known accepted dataset counts.");
    const keys = new Set(); let occurrences = 0;
    const items = input.items.map(item => {
      if (!item || !Object.hasOwn(item, "value") || !Number.isInteger(item.count) || item.count < 1 || item.count > input.matched)
        throw new Error("CanopyX: invalid facet value/count bucket.");
      const key = gridFacetKey(item.value, column);
      if (keys.has(key)) throw new Error("CanopyX: duplicate typed facet bucket.");
      keys.add(key); occurrences += item.count;
      return { value: item.value, count: item.count };
    });
    if (occurrences > input.matched || !request.search && !input.truncated && occurrences !== input.matched)
      throw new Error("CanopyX: facet buckets contradict the matching row count.");
    return gridFreeze({ protocol: PROTOCOL, type: "gridFacetPage", view: input.view, revision: input.revision,
      column: input.column, search: input.search, includeCurrentFilter: input.includeCurrentFilter,
      matched: input.matched, totalValues: input.totalValues, truncated: input.truncated, items, ...(request.bucket ? { bucket: request.bucket } : {}) });
  }
