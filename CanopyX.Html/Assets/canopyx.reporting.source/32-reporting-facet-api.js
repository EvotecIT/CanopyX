  // ---------- facet requests share the accepted-query and bounded host-operation lifetime ----------
  const FACET_API = GRID_REPORTING.api;
  GRID_REPORTING.api = (api, grid) => {
    FACET_API?.(api, grid);
    api.getFacets = (column, options) => grid.getFacets(column, options);
  };
  DataGrid.prototype.getFacets = async function (column, options = {}) {
    if (this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.view.reporting?.facetColumns?.includes(column) || typeof this.source.facet !== "function")
      throw new Error("CanopyX: facets need an accepted query, opted-in column and explicit source capability.");
    const search = options.search === undefined ? "" : options.search, limit = options.limit === undefined ? 100 : options.limit,
      includeCurrentFilter = options.includeCurrentFilter === undefined ? true : options.includeCurrentFilter;
    if (typeof search !== "string" || search.length > 16384 || !Number.isInteger(limit) || limit < 1 || limit > 200 || typeof includeCurrentFilter !== "boolean")
      throw new Error("CanopyX: invalid bounded facet request.");
    const controller = new AbortController(), dataSignal = this.dataLifetime.signal, epoch = this.queryEpoch;
    const abort = () => controller.abort();
    dataSignal.addEventListener("abort", abort, { once: true }); options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const bucket = options.bucket === undefined ? null : gridBucketDefinition(options.bucket, this.view.columns.find(item => item.id === column));
    if (bucket) await loadPart(BUCKETS_PART);
    const request = gridFreeze({ protocol: PROTOCOL, type: "gridFacetQuery", column, search, limit, includeCurrentFilter, query: this.acceptedQuery, ...(bucket ? { bucket } : {}) });
    try {
      const page = await this.runGridHook(signal => this.source.facet(request, { signal }), controller.signal);
      gridOperationActive(this, controller.signal);
      if (epoch !== this.queryEpoch) throw new DOMException("Facet request was superseded.", "AbortError");
      return reportingFacetPage(page, this, request);
    } finally {
      dataSignal.removeEventListener("abort", abort); options.signal?.removeEventListener("abort", abort); controller.abort();
    }
  };
